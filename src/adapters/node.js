import { openAsBlob } from 'node:fs'
import fs from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { errors } from '../util.js'

import config from '../config.js'

const {
  DOMException
} = config

const { GONE, MISMATCH, MOD_ERR, NO_MOD } = errors

const openWritables = new Map()

export function clearLocks () {
  openWritables.clear()
}

/**
 * @param {string} path
 */
function isLocked (path) {
  for (const [lockedPath, count] of openWritables) {
    if (count > 0 && (lockedPath === path || lockedPath.startsWith(path + '/'))) {
      return true
    }
  }
  return false
}

export class Sink {
  /**
   * @param {fs.FileHandle} fileHandle
   * @param {number} size
   * @param {string} dirPath
   * @param {string} path
   * @param {string} tempPath
   */
  constructor (fileHandle, size, dirPath, path, tempPath) {
    this._fileHandle = fileHandle
    /** Exposed so FileSystemWritableFileStream can read the initial file size. */
    this.size = size
    this._dirPath = dirPath
    this._path = path
    this._tempPath = tempPath
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
    await fs.unlink(this._tempPath).catch(() => {})
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
    // First make sure we close the handle
    await this._fileHandle.close()
    await fs.rename(this._tempPath, this._path)
    openWritables.set(this._path, openWritables.get(this._path) - 1)
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

  /** @param {{ keepExistingData: boolean; }} opts */
  async createWritable (opts) {
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

  async move (dest, newName) {
    if (newName === '') throw new TypeError('Name cannot be empty.')
    if (isLocked(this._path)) throw new DOMException(...NO_MOD)
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

    if (isLocked(newPath)) throw new DOMException(...NO_MOD)

    await fs.rename(this._path, newPath).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })

    this._path = newPath
    this.name = name
  }

  async remove () {
    if (isLocked(this._path)) throw new DOMException(...NO_MOD)
    await fs.unlink(this._path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
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
}

export default path => new FolderHandle(path, '', true)
