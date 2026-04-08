import { openAsBlob } from 'node:fs'
import fs from 'node:fs/promises'
import { readSync, writeSync, ftruncateSync, fsyncSync, closeSync, fstatSync, openSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { errors } from '../util.js'

import config from '../config.js'

const {
  DOMException
} = config

const { GONE, MISMATCH, MOD_ERR, NO_MOD } = errors

/**
 * Returns a stable UUID-format unique ID derived from the file-system kind and
 * absolute path.  Two handles pointing at the same entry always produce the
 * same string; a file and a directory that share a path (after the file is
 * removed and a directory is created) produce different strings because `kind`
 * is included in the hash input.
 *
 * @param {string} kind - 'file' | 'directory'
 * @param {string} path
 * @returns {string}
 */
function pathToUUID (kind, path) {
  const hash = createHash('sha256').update(`${kind}:${path}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

const openWritables = new Map()
/** Tracks the number of open FileSystemSyncAccessHandles per path. */
const openSyncHandles = new Map()

export function clearLocks () {
  openWritables.clear()
  openSyncHandles.clear()
}

/**
 * Returns true if `map` contains a positive count for `path` or any
 * ancestor/descendant path.
 *
 * @param {Map<string, number>} map
 * @param {string} path
 */
function hasLockIn (map, path) {
  for (const [lockedPath, count] of map) {
    if (count > 0 && (lockedPath === path || lockedPath.startsWith(path + '/'))) {
      return true
    }
  }
  return false
}

/** Returns true if there is an open writable on `path` or a descendant. */
function isLocked (path) {
  return hasLockIn(openWritables, path)
}

/**
 * Returns true if an open FileSystemSyncAccessHandle holds an exclusive lock
 * on `path` or any descendant path.
 *
 * @param {string} path
 */
function hasSyncHandle (path) {
  return hasLockIn(openSyncHandles, path)
}

export class Sink {
  /**
   * @param {fs.FileHandle} fileHandle
   * @param {number} size
   * @param {string} dirPath
   * @param {string} path
   * @param {string} tempPath
   * @param {boolean} [inPlace] - When true, writes go directly to the real file (no rename on close).
   */
  constructor (fileHandle, size, dirPath, path, tempPath, inPlace = false) {
    this._fileHandle = fileHandle
    /** Exposed so FileSystemWritableFileStream can read the initial file size. */
    this.size = size
    this._dirPath = dirPath
    this._path = path
    this._tempPath = tempPath
    this._inPlace = inPlace
    openWritables.set(path, (openWritables.get(path) || 0) + 1)
  }

  async _checkDir () {
    await fs.stat(this._dirPath).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
  }

  async abort() {
    await this._fileHandle.close()
    if (!this._inPlace) {
      await fs.unlink(this._tempPath).catch(() => {})
    }
    openWritables.set(this._path, openWritables.get(this._path) - 1)
  }

  /**
   * Write a Blob at the given byte offset.
   * Called by the outer FileSystemWritableFileStream after WriteParams parsing.
   *
   * @param {Blob} blob
   * @param {number} position
   */
  async write (blob, position) {
    await this._checkDir()
    let pos = position
    try {
      for await (const data of blob.stream()) {
        const res = await this._fileHandle.write(data, 0, data.length, pos)
        pos += res.bytesWritten
      }
      this.size = Math.max(this.size, pos)
    } catch (err) {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      // A blob that can no longer be read (e.g. the source handle was deleted)
      // should surface as NotFoundError, matching the behaviour of other adapters.
      if (err.name === 'NotReadableError') throw new DOMException(...GONE)
      throw err
    }
  }

  /**
   * Truncate (or zero-extend) the file to exactly `size` bytes.
   *
   * @param {number} size
   */
  async truncate (size) {
    try {
      await this._fileHandle.truncate(size)
      this.size = size
    } catch (err) {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    }
  }

  async close () {
    await this._fileHandle.close()
    if (!this._inPlace) {
      await fs.rename(this._tempPath, this._path)
    }
    openWritables.set(this._path, openWritables.get(this._path) - 1)
  }
}

/**
 * Synchronous adapter for the Node.js file system adapter.
 *
 * Uses a synchronous file descriptor opened with `openSync` so that all
 * read/write/truncate/flush/close operations can be performed without Promises.
 */
export class NodeSyncAdapter {
  /**
   * @param {number} fd    Synchronous file descriptor (from `openSync`).
   * @param {string} path  Absolute path of the file, used for lock tracking.
   */
  constructor (fd, path) {
    this._fd = fd
    this._path = path
    // Track this sync access handle in openSyncHandles (exclusive lock).
    openSyncHandles.set(path, (openSyncHandles.get(path) || 0) + 1)
  }

  /**
   * @param {Uint8Array} buffer
   * @param {number} at
   * @returns {number}
   */
  read (buffer, at) {
    try {
      return readSync(this._fd, buffer, 0, buffer.length, at)
    } catch (err) {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    }
  }

  /**
   * @param {Uint8Array} buffer
   * @param {number} at
   * @returns {number}
   */
  write (buffer, at) {
    try {
      writeSync(this._fd, buffer, 0, buffer.length, at)
      return buffer.length
    } catch (err) {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    }
  }

  /** @param {number} newSize */
  truncate (newSize) {
    try {
      ftruncateSync(this._fd, newSize)
    } catch (err) {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    }
  }

  /** @returns {number} */
  getSize () {
    return fstatSync(this._fd).size
  }

  flush () {
    try {
      fsyncSync(this._fd)
    } catch (err) {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    }
  }

  close () {
    try {
      closeSync(this._fd)
    } catch (_err) {
      // Ignore close errors.
    }
    const count = (openSyncHandles.get(this._path) || 1) - 1
    if (count <= 0) {
      openSyncHandles.delete(this._path)
    } else {
      openSyncHandles.set(this._path, count)
    }
  }
}

export class FileHandle {

  /**
   * @param {string} path
   * @param {string} name
   */
  constructor (path, name) {
    this._path = path
    this.name = name
    this.kind = 'file'
  }

  async getFile () {
    await fs.stat(this._path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
    })

    const blob = await openAsBlob(this._path)
    const { mtimeMs } = await fs.stat(this._path)
    return new File([blob], this.name, { lastModified: mtimeMs })
  }

  async isSameEntry (other) {
    return this._path === this._getPath.apply(other)
  }

  _getPath() {
    return this._path
  }

  getUniqueId () {
    return pathToUUID(this.kind, this._path)
  }

  /**
   * @param {{ keepExistingData?: boolean; mode?: 'exclusive-atomic' | 'exclusive-in-place' | 'siloed' }} opts
   */
  async createWritable (opts) {
    const mode = opts.mode

    // A sync access handle holds an exclusive lock — block all new writables.
    if (hasSyncHandle(this._path)) throw new DOMException(...NO_MOD)

    // Exclusive modes allow only one writer at a time.
    if (mode === 'exclusive-atomic' || mode === 'exclusive-in-place') {
      if (isLocked(this._path)) throw new DOMException(...NO_MOD)
    }

    if (mode === 'exclusive-in-place') {
      // Write directly to the real file — no temp file, no rename on close.
      // If keepExistingData is false, truncate to 0 on open.
      const fileHandle = await fs.open(this._path, 'r+').catch(err => {
        if (err.code === 'ENOENT') throw new DOMException(...GONE)
        throw err
      })
      if (!opts.keepExistingData) {
        await fileHandle.truncate(0)
      }
      const { size } = await fileHandle.stat()
      return new Sink(fileHandle, size, dirname(this._path), this._path, this._path, true)
    }

    // 'exclusive-atomic' and 'siloed' (default when mode is undefined) both use a temp file.
    const tempPath = this._path + '.' + Math.random().toString(36).slice(2) + '.tmp'
    if (opts.keepExistingData) {
      await fs.copyFile(this._path, tempPath).catch(err => {
        if (err.code === 'ENOENT') throw new DOMException(...GONE)
        throw err
      })
    }
    const fileHandle = await fs.open(tempPath, opts.keepExistingData ? 'r+' : 'w+').catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    const { size } = await fileHandle.stat()
    return new Sink(fileHandle, size, dirname(this._path), this._path, tempPath)
  }

  /**
   * Obtain a synchronous access handle with an exclusive lock on the file.
   *
   * @returns {Promise<NodeSyncAdapter>}
   */
  async createSyncAccessHandle () {
    if (isLocked(this._path) || hasSyncHandle(this._path)) {
      throw new DOMException(...NO_MOD)
    }
    // Ensure the file exists before opening it synchronously.
    await fs.stat(this._path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    let fd
    try {
      fd = openSync(this._path, 'r+')
    } catch (err) {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    }
    return new NodeSyncAdapter(fd, this._path)
  }

  async move (dest, newName) {
    if (newName === '') throw new TypeError('Name cannot be empty.')
    if (isLocked(this._path) || hasSyncHandle(this._path)) throw new DOMException(...NO_MOD)
    const name = newName || this.name
    const destPath = dest ? dest._path : dirname(this._path)
    const newPath = join(destPath, name)

    if (newPath === this._path) return

    if (newName && (newName.includes('/') || newName.includes('\\') || newName === '.' || newName === '..')) {
      throw new TypeError('Name contains invalid characters.')
    }

    const stat = await fs.lstat(newPath).catch(() => null)
    if (stat && stat.isDirectory()) {
      throw new DOMException(...MOD_ERR)
    }

    if (isLocked(newPath) || hasSyncHandle(newPath)) throw new DOMException(...NO_MOD)

    await fs.rename(this._path, newPath).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })

    this._path = newPath
    this.name = name
  }

  async remove () {
    if (isLocked(this._path) || hasSyncHandle(this._path)) throw new DOMException(...NO_MOD)
    await fs.unlink(this._path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
  }

  serialize () {
    return { adapter: `${import.meta.url}:FileHandle`, kind: this.kind, name: this.name, path: this._path }
  }
}

export class FolderHandle {
  _path = ''

  constructor (path = '', name = '', isRoot = false) {
    this.name = name
    this.kind = 'directory'
    this._path = path
    this._isRoot = isRoot
  }

  /** @param {FolderHandle} other */
  async isSameEntry (other) {
    return this._path === other._path
  }

  getUniqueId () {
    return pathToUUID(this.kind, this._path)
  }

  /** @returns {AsyncGenerator<[string, FileHandle | FolderHandle]>} */
  async * entries () {
    const dir = this._path
    const items = await fs.readdir(dir).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    for (let name of items) {
      const path = join(dir, name)
      const stat = await fs.lstat(path)
      if (stat.isFile()) {
        yield [name, new FileHandle(path, name)]
      } else if (stat.isDirectory()) {
        yield [name, new FolderHandle(path, name)]
      }
    }
  }

  /**
   * @param {string} name
   * @param {{ create: boolean; }} opts
   */
  async getDirectoryHandle (name, opts) {
    const path = join(this._path, name)
    const stat = await fs.lstat(path).catch(err => {
      if (err.code !== 'ENOENT') throw err
    })
    const isDirectory = stat?.isDirectory()
    if (stat && isDirectory) return new FolderHandle(path, name)
    if (stat && !isDirectory) throw new DOMException(...MISMATCH)
    if (!opts.create) throw new DOMException(...GONE)
    await fs.mkdir(path)
    return new FolderHandle(path, name)
  }

  /**
   * @param {string} name
   * @param {{ create: boolean; }} opts
   */
  async getFileHandle (name, opts) {
    const path = join(this._path, name)
    const stat = await fs.lstat(path).catch(err => {
      if (err.code !== 'ENOENT') throw err
    })
    const isFile = stat?.isFile()
    if (stat && isFile) return new FileHandle(path, name)
    if (stat && !isFile) throw new DOMException(...MISMATCH)
    if (!opts.create) throw new DOMException(...GONE)
    await (await fs.open(path, 'w')).close()
    return new FileHandle(path, name)
  }

  async queryPermission () {
    return 'granted'
  }

  /**
   * @param {string} name
   * @param {{ recursive: boolean; }} opts
   */
  async removeEntry (name, opts) {
    const path = join(this._path, name)
    if (isLocked(path)) throw new DOMException(...NO_MOD)
    const stat = await fs.lstat(path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    if (stat.isDirectory()) {
      if (opts.recursive) {
        await fs.rm(path, { recursive: true, }).catch(err => {
          if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
          throw err
        })
      } else {
        await fs.rmdir(path).catch(err => {
          if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
          throw err
        })
      }
    } else {
      await fs.unlink(path)
    }
  }

  async remove (options = {}) {
    if (this._isRoot) {
      const entries = await fs.readdir(this._path)
      for (const name of entries) {
        await this.removeEntry(name, { recursive: true })
      }
      return
    }
    const path = this._path
    if (isLocked(path)) throw new DOMException(...NO_MOD)
    const stat = await fs.lstat(path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    if (stat.isDirectory()) {
      if (!options.recursive) {
        const entries = await fs.readdir(path)
        if (entries.length > 0) {
          throw new DOMException(...MOD_ERR)
        }
        await fs.rmdir(path).catch(err => {
          if (err.code === 'ENOENT') throw new DOMException(...GONE)
          if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
          throw err
        })
      } else {
        await fs.rm(path, { recursive: true }).catch(err => {
          if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
          throw err
        })
      }
    } else {
      await fs.unlink(path)
    }
  }

  serialize () {
    return { adapter: `${import.meta.url}:FolderHandle`, kind: this.kind, name: this.name, path: this._path }
  }
}

/**
 * Reconstruct a FileHandle or FolderHandle from a previously serialized object.
 *
 * @param {{ kind: 'file'|'directory', name: string, path: string }} data
 * @returns {FileHandle|FolderHandle}
 */
export function deserialize (data) {
  if (!data || typeof data.path !== 'string' || !data.kind || !data.name) {
    throw new TypeError('Invalid serialized handle data.')
  }
  if (data.kind === 'file') return new FileHandle(data.path, data.name)
  return new FolderHandle(data.path, data.name)
}

export default path => new FolderHandle(path, '', true)
