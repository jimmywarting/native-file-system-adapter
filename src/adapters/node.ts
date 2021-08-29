import fs from 'fs/promises'
import { errors, isChunkObject } from '../util.js'
import { join } from 'path'
import Blob from 'fetch-blob'
import { fileFrom } from 'fetch-blob/from.js'
import { Adapter, FileSystemFileHandleAdapter, FileSystemFolderHandleAdapter, WriteChunk } from '../interfaces.js'
import DOMException from 'node-domexception'

// import mime from 'mime-types'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX } = errors

export class Sink implements UnderlyingSink<WriteChunk> {
  private fileHandle: fs.FileHandle
  private size: number
  private path: string
  private position = 0

  constructor (fileHandle: fs.FileHandle, path: string, size: number) {
    this.fileHandle = fileHandle
    this.path = path
    this.size = size
    this.position = 0
  }

  async abort() {
    await this.fileHandle.close()
  }

  async write (chunk: WriteChunk) {
    try {
      await fs.stat(this.path)
    } catch(err) {
      if (err.code === 'ENOENT') {
        await this.fileHandle.close().catch()
        throw new DOMException(...GONE)
      }
    }

    if (isChunkObject(chunk)) {
      if (chunk.type === 'write') {
        if (typeof chunk.position === 'number' && chunk.position >= 0) {
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
      chunk = Buffer.from(chunk)
    } else if (chunk instanceof Blob) {
      for await (const data of (chunk as Blob).stream()) {
        const res = await this.fileHandle.writev([data], this.position)
        this.position += res.bytesWritten
        this.size += res.bytesWritten
      }
      return
    }

    const res = await this.fileHandle.writev([chunk as Uint8Array | DataView], this.position)
    this.position += res.bytesWritten
    this.size += res.bytesWritten
  }

  async close () {
    // First make sure we close the handle
    await this.fileHandle.close()
    await fs.stat(this.path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
    })
  }
}

export class FileHandle implements FileSystemFileHandleAdapter {
  readonly kind = 'file'
  readonly name: string
  private _path: string
  writable = true

  constructor (path: string, name: string) {
    this._path = path
    this.name = name
  }

  async getFile () {
    await fs.stat(this._path).catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
    })
    return (await fileFrom(this._path)) as any as globalThis.File
  }

  async isSameEntry (other: FileHandle) {
    return this._path === this.#getPath.apply(other)
  }

  #getPath() {
    return this._path
  }

  async createWritable () {
    const fileHandle = await fs.open(this._path, 'r+').catch(err => {
      if (err.code === 'ENOENT') throw new DOMException(...GONE)
      throw err
    })
    const { size } = await fileHandle.stat()
    return new Sink(fileHandle, this._path, size)
  }
}

export class FolderHandle implements FileSystemFolderHandleAdapter {
  readonly kind = 'directory'
  readonly name: string
  private _path: string
  writable = true

  constructor (path = '', name = '') {
    this.name = name
    this._path = path
  }

  async isSameEntry (other: FolderHandle) {
    return this._path === other._path
  }

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
        yield [name, new FileHandle(path, name)] as [string, FileHandle]
      } else if (stat.isDirectory()) {
        yield [name, new FolderHandle(path, name)] as [string, FolderHandle]
      }
    }
  }

  async getDirectoryHandle (name: string, opts: FileSystemGetDirectoryOptions = {}) {
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

  async getFileHandle (name: string, opts: FileSystemGetFileOptions = {}) {
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
    return 'granted' as PermissionState
  }

  async removeEntry (name: string, opts: FileSystemRemoveOptions) {
    const path = join(this._path, name)
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
}

const adapter: Adapter<string> = path => new FolderHandle(path)
export default adapter
