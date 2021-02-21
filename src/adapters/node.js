import { truncateSync, createWriteStream, createReadStream, promises as fs } from 'fs'
import { errors } from '../util.js'
import { join } from 'path'
import Blob from 'fetch-blob'
import blobFrom from 'fetch-blob/from.js'
import DOMException from 'domexception'

// import mime from 'mime-types'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, SECURITY, DISALLOWED } = errors

class File extends Blob {
	constructor(blobParts, fileName, options = {}) {
		const { lastModified = Date.now(), ...blobPropertyBag } = options
		super(blobParts, blobPropertyBag)
		this.name = String(fileName).replace(/\//g, '\u003A')
		this.lastModified = +lastModified
		this.lastModifiedDate = new Date(lastModified)
	}

  get [Symbol.toStringTag]() {
		return 'File'
	}
}

export class Sink {
  constructor (filehandle, size) {
    this.filehandle = filehandle
    this.size = size
    this.position = 0
  }
  abort() {
    this.filehandle.close()
  }
  async write (chunk) {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          if (this.size < chunk.position) {
            this.filehandle.close()
            throw new DOMException(...INVALID)
          }
          this.position = chunk.position
        }
        if (!('data' in chunk)) {
          await this.filehandle.close()
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
          await this.filehandle.close()
          throw new DOMException(...SYNTAX('seek requires a position argument'))
        }
      } else if (chunk.type === 'truncate') {
        if (Number.isInteger(chunk.size) && chunk.size >= 0) {
          await this.filehandle.truncate(chunk.size)
          this.size = chunk.size
          if (this.position > this.size) {
            this.position = this.size
          }
          return
        } else {
          await this.filehandle.close()
          throw new DOMException(...SYNTAX('truncate requires a size argument'))
        }
      }
    }

    if (chunk instanceof ArrayBuffer) {
      chunk = new Uint8Array(chunk)
    }

    // Probably should make this the default if
    // chunk isn't converted to a buffer
    if (typeof chunk === 'string') {
      chunk = Buffer.from(chunk)
    }

    if (chunk instanceof Blob) {
      for await (const data of chunk.stream()) {
        const res = await this.filehandle.writev([data], this.position)
        this.position += res.bytesWritten
        this.size += res.bytesWritten
      }
      return
    }

    const res = await this.filehandle.writev([chunk], this.position)
    this.position += res.bytesWritten
    this.size += res.bytesWritten
  }
  async close () {
    await this.filehandle.close()
  }
}

export class FileHandle {
  #path

  constructor (path, name) {
    this.#path = path
    this.name = name
    this.kind = 'file'
  }

  async getFile () {
    const { mtime } = await fs.stat(this.#path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
    })
    const blob = blobFrom(this.#path)
    return new File([blob], this.name, {
      lastModified: mtime,
      type: ''
    })
  }

  async createWritable () {
    const filehandle = await fs.open(this.#path, 'r+').catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    const { size } = await filehandle.stat()
    return new Sink(filehandle, size)
  }
}

export class FolderHandle {
  #path = ''

  constructor (path, name = '') {
    this.name = name
    this.kind = 'directory'
    this.#path = path
  }

  async * entries () {
    const dir = this.#path
    const items = await fs.readdir(dir)
    for (let name of items) {
      const path = join(dir, name)
      const stat = await fs.lstat(path)
      if (stat.isFile()) {
        yield new FileHandle(path, name)
      } else if (stat.isDirectory()) {
        yield new FolderHandle(path, name)
      }
    }
  }

  async getDirectoryHandle (name, opts = {}) {
    const path = join(this.#path, name)
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

  async getFileHandle (name, opts = {}) {
    const path = join(this.#path, name)
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

  async removeEntry (name, opts) {
    const path = join(this.#path, name)
    const stat = await fs.lstat(path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    return stat.isDirectory() ? fs.rmdir(path, {
      recursive: !!opts.recursive
    }).catch(err => {
      if (err.code === 'ENOTEMPTY') throw new DOMException(...MOD_ERR)
      console.log(123132)
      throw err
    }) : fs.unlink(path)
  }
}

export default path => new FolderHandle(path)
