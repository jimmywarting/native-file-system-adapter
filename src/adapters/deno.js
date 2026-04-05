import { join, basename } from 'jsr:@std/path'
import { errors } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX } = errors

/** @param {string} path */
function fileFrom (path) {
  const e = Deno.readFileSync(path)
  const s = Deno.statSync(path)
  return new File([new Blob([e], { type: 'application/octet-stream' })], basename(path), { lastModified: Number(s.mtime) })
}

export class Sink {
  /**
   * @param {Deno.File} fileHandle
   * @param {number} size
   */
  constructor (fileHandle, size) {
    this.fileHandle = fileHandle
    this.size = size
    this.position = 0
  }
  async abort() {
    await this.fileHandle.close()
  }
  async write (chunk) {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          this.position = chunk.position
        }
        if (!('data' in chunk)) {
          await this.fileHandle.close()
          throw new DOMException(...SYNTAX('write requires a data argument'))
        }
        chunk = chunk.data
      } else if (chunk.type === 'seek') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          if (this.size < chunk.position) {
            throw new DOMException(...INVALID)
          }
          this.position = chunk.position
          return
        } else {
          await this.fileHandle.close()
          throw new DOMException(...SYNTAX('seek requires a position argument'))
        }
      } else if (chunk.type === 'truncate') {
        if (Number.isInteger(chunk.size) && chunk.size >= 0) {
          await this.fileHandle.truncate(chunk.size)
          this.size = chunk.size
          if (this.position > this.size) {
            this.position = this.size
          }
          return
        } else {
          await this.fileHandle.close()
          throw new DOMException(...SYNTAX('truncate requires a size argument'))
        }
      }
    }

    if (chunk instanceof ArrayBuffer) {
      chunk = new Uint8Array(chunk)
    } else if (typeof chunk === 'string') {
      chunk = new TextEncoder().encode(chunk)
    } else if (chunk instanceof Blob) {
      await this.fileHandle.seek(this.position, Deno.SeekMode.Start)
      for await (const data of chunk.stream()) {
        const written = await this.fileHandle.write(data)
        this.position += written
        this.size = Math.max(this.size, this.position)
      }
      return
    }
    await this.fileHandle.seek(this.position, Deno.SeekMode.Start)
    const written = await this.fileHandle.write(chunk)
    this.position += written
    this.size = Math.max(this.size, this.position)
  }

  async close () {
    await this.fileHandle.close()
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

  /** @param {{ keepExistingData: boolean; }} opts */
  async createWritable (opts) {
    const fileHandle = await Deno.open(this.#path, { write: true, truncate: !opts.keepExistingData }).catch(err => {
      if (err.name === 'NotFound') throw new DOMException(...GONE)
      throw err
    })

    const { size } = await fileHandle.stat()
    return new Sink(fileHandle, size)
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
