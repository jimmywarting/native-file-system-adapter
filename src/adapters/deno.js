import { join, basename, dirname } from 'jsr:@std/path'
import { errors } from '../util.js'

const { GONE, MISMATCH, MOD_ERR, NO_MOD } = errors

/**
 * Returns a stable UUID-format unique ID derived from the file-system kind and
 * absolute path using SHA-256 via the Web Crypto API.
 *
 * @param {string} kind - 'file' | 'directory'
 * @param {string} path
 * @returns {Promise<string>}
 */
async function pathToUUID (kind, path) {
  const data = new TextEncoder().encode(`${kind}:${path}`)
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** @param {string} path */
function fileFrom (path) {
  const e = Deno.readFileSync(path)
  const s = Deno.statSync(path)
  return new File([new Blob([e], { type: 'application/octet-stream' })], basename(path), { lastModified: Number(s.mtime) })
}

const openWritables = new Map()

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
   * @param {Deno.FsFile} fileHandle
   * @param {number} size
   * @param {string} path
   * @param {string} tempPath
   * @param {boolean} [inPlace]
   */
  constructor (fileHandle, size, path, tempPath, inPlace = false) {
    this.fileHandle = fileHandle
    /** Exposed so FileSystemWritableFileStream can read the initial file size. */
    this.size = size
    this._path = path
    this._tempPath = tempPath
    this._inPlace = inPlace
    openWritables.set(path, (openWritables.get(path) || 0) + 1)
  }

  async abort () {
    await this.fileHandle.close()
    if (!this._inPlace) {
      await Deno.remove(this._tempPath).catch(() => {})
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
    await this.fileHandle.seek(position, Deno.SeekMode.Start)
    for await (const data of blob.stream()) {
      await this.fileHandle.write(data)
    }
    this.size = Math.max(this.size, position + blob.size)
  }

  /**
   * Truncate (or zero-extend) the file to exactly `size` bytes.
   *
   * @param {number} size
   */
  async truncate (size) {
    await this.fileHandle.truncate(size)
    this.size = size
  }

  async close () {
    await this.fileHandle.close()
    if (!this._inPlace) {
      await Deno.rename(this._tempPath, this._path)
    }
    openWritables.set(this._path, openWritables.get(this._path) - 1)
  }
}

export class FileHandle {
  #path

  /**
   * @param {string} path
   * @param {string} name
   */
  constructor (path, name) {
    this.#path = path
    this.name = name
    this.kind = 'file'
  }

  async getFile () {
    await Deno.stat(this.#path).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
    })
    return fileFrom(this.#path)
  }

  async isSameEntry (other) {
    return this.#path === this.#getPath.apply(other)
  }

  #getPath() {
    return this.#path
  }

  getUniqueId () {
    return pathToUUID(this.kind, this.#path)
  }

  /**
   * @param {{ keepExistingData?: boolean; mode?: 'exclusive-atomic' | 'exclusive-in-place' | 'siloed' }} opts
   */
  async createWritable (opts) {
    const mode = opts.mode

    // Exclusive modes allow only one writer at a time.
    if (mode === 'exclusive-atomic' || mode === 'exclusive-in-place') {
      if (isLocked(this.#path)) throw new DOMException(...NO_MOD)
    }

    if (mode === 'exclusive-atomic') {
      // Write to a temp file and rename atomically on close.
      const tempPath = this.#path + '.' + Math.random().toString(36).slice(2) + '.tmp'
      if (opts.keepExistingData) {
        await Deno.copyFile(this.#path, tempPath).catch(err => {
          if (err.name === 'NotFound') throw new DOMException(...GONE)
          throw err
        })
      }
      const fileHandle = await Deno.open(tempPath, {
        write: true,
        create: true,
        truncate: !opts.keepExistingData,
      }).catch(err => {
        if (err.name === 'NotFound') throw new DOMException(...GONE)
        throw err
      })
      const { size } = await fileHandle.stat()
      return new Sink(fileHandle, size, this.#path, tempPath, false)
    }

    // 'exclusive-in-place', 'siloed', and the default (undefined mode) all write directly
    // to the real file — Deno's native in-place I/O model.  Note that for 'siloed', this
    // means each concurrent writer shares the same underlying file descriptor rather than
    // having its own independent swap buffer; 'exclusive-atomic' is the mode to use when
    // true independent-buffer / last-close-wins semantics are required.
    const fileHandle = await Deno.open(this.#path, { write: true, truncate: !opts.keepExistingData }).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
      throw err
    })

    const { size } = await fileHandle.stat()
    return new Sink(fileHandle, size, this.#path, this.#path, true)
  }

  async move (dest, newName) {
    if (newName === '') throw new TypeError('Name cannot be empty.')
    const name = newName || this.name
    const destPath = dest ? dest.#getPath.call(dest) : dirname(this.#path)
    const newPath = join(destPath, name)

    if (newPath === this.#path) return

    if (newName && (newName.includes('/') || newPath.includes('\\') || newName === '.' || newName === '..')) {
      throw new TypeError('Name contains invalid characters.')
    }

    const stat = await Deno.lstat(newPath).catch(() => null)
    if (stat && stat.isDirectory) {
      throw new DOMException(...MOD_ERR)
    }

    await Deno.rename(this.#path, newPath).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
      throw err
    })

    this.#path = newPath
    this.name = name
  }

  async remove () {
    await Deno.remove(this.#path).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
      throw err
    })
  }
}

export class FolderHandle {
  #path = ''

  /** @param {string} path */
  constructor (path, name = '') {
    this.name = name
    this.kind = 'directory'
    this.#path = join(path)
  }

  async isSameEntry (other) {
    return this.#path === this.#getPath.apply(other)
  }

  #getPath() {
    return this.#path
  }

  getUniqueId () {
    return pathToUUID(this.kind, this.#path)
  }

  /** @returns {AsyncGenerator<[string, FileHandle | FolderHandle]>} */
  async * entries () {
    const dir = this.#path
    try {
      for await (const dirEntry of Deno.readDir(dir)) {
        const { name } = dirEntry
        const path = join(dir, name)
        const stat = await Deno.lstat(path)
        if (stat.isFile) {
          yield [name, new FileHandle(path, name)]
        } else if (stat.isDirectory) {
          yield [name, new FolderHandle(path, name)]
        }
      }
    } catch (err) {
      throw err.name === 'NotFound' ? new DOMException(...GONE) : err
    }
  }

  /**
   * @param {string} name
   * @param {{ create: boolean; }} opts
   */
  async getDirectoryHandle (name, opts) {
    const path = join(this.#path, name)
    const stat = await Deno.lstat(path).catch(err => {
      if (err.name !== 'NotFound') throw err
    })
    const isDirectory = stat?.isDirectory
    if (stat && isDirectory) return new FolderHandle(path, name)
    if (stat && !isDirectory) throw new DOMException(...MISMATCH)
    if (!opts.create) throw new DOMException(...GONE)
    await Deno.mkdir(path)
    return new FolderHandle(path, name)
  }

  /**
   * @param {string} name
   * @param {{ create: any; }} opts
   */
  async getFileHandle (name, opts) {
    const path = join(this.#path, name)
    const stat = await Deno.lstat(path).catch(err => {
      if (err.name !== 'NotFound') throw err
    })

    const isFile = stat?.isFile
    if (stat && isFile) return new FileHandle(path, name)
    if (stat && !isFile) throw new DOMException(...MISMATCH)
    if (!opts.create) throw new DOMException(...GONE)
    const c = await Deno.open(path, {
      create: true,
      write: true,
    })
    c.close()
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
    const path = join(this.#path, name)
    const stat = await Deno.lstat(path).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
      throw err
    })

    if (stat.isDirectory) {
      if (opts.recursive) {
        await Deno.remove(path, { recursive: true }).catch(err => {
          if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
          throw err
        })
      } else {
        await Deno.remove(path).catch(() => {
          throw new DOMException(...MOD_ERR)
        })
      }
    } else {
      await Deno.remove(path)
    }
  }

  async remove (options = {}) {
    const stat = await Deno.lstat(this.#path).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
      throw err
    })
    if (stat.isDirectory) {
      if (!options.recursive) {
        for await (const _ of Deno.readDir(this.#path)) {
          throw new DOMException(...MOD_ERR)
        }
      }
      await Deno.remove(this.#path, { recursive: !!options.recursive })
    } else {
      await Deno.remove(this.#path)
    }
  }
}

export default path => new FolderHandle(join(Deno.cwd(), path))
