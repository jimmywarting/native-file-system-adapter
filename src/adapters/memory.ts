import { Adapter, FileSystemFileHandleAdapter, FileSystemFolderHandleAdapter, WriteChunk } from '../interfaces.js'
import { errors, isChunkObject } from '../util.js'

let File = globalThis.File
let Blob = globalThis.Blob

/** @internal */
export const setFileImpl = (fileCtor: typeof globalThis.File) => {
  File = fileCtor
}

/** @internal */
export const setBlobImpl = (blobCtor: typeof globalThis.Blob) => {
  Blob = blobCtor
}

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, DISALLOWED } = errors

class Sink implements UnderlyingSink<WriteChunk> {
  private fileHandle: FileHandle
  private file: File
  private size: number
  private position: number

  constructor (fileHandle: FileHandle, keepExistingData: boolean) {
    this.fileHandle = fileHandle
    this.file = keepExistingData ? fileHandle.file! : new File([], fileHandle.file!.name, fileHandle.file!)
    this.size = keepExistingData ? fileHandle.file!.size : 0
    this.position = 0
  }

  async write (chunk: WriteChunk) {
    if (!this.fileHandle.file) throw new DOMException(...GONE)

    let file = this.file

    if (isChunkObject(chunk)) {
      if (chunk.type === 'write') {
        if (typeof chunk.position === 'number' && chunk.position >= 0) {
          this.position = chunk.position
          if (this.size < chunk.position) {
            this.file = new File(
              [this.file, new ArrayBuffer(chunk.position - this.size)],
              this.file.name,
              this.file
            )
          }
        }
        if (!('data' in chunk)) {
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
          throw new DOMException(...SYNTAX('seek requires a position argument'))
        }
      } else if (chunk.type === 'truncate') {
        if (Number.isInteger(chunk.size) && chunk.size >= 0) {
          file = chunk.size < this.size
            ? new File([file.slice(0, chunk.size)], file.name, file)
            : new File([file, new Uint8Array(chunk.size - this.size)], file.name, file)

          this.size = file.size
          if (this.position > file.size) {
            this.position = file.size
          }
          this.file = file
          return
        } else {
          throw new DOMException(...SYNTAX('truncate requires a size argument'))
        }
      }
    }

    chunk = new Blob([chunk])

    let blob = this.file
    // Calc the head and tail fragments
    const head = blob.slice(0, this.position)
    const tail = blob.slice(this.position + chunk.size)

    // Calc the padding
    let padding = this.position - head.size
    if (padding < 0) {
      padding = 0
    }
    blob = new File([
      head,
      new Uint8Array(padding),
      chunk,
      tail
    ], blob.name)

    this.size = blob.size
    this.position += chunk.size

    this.file = blob
  }

  async close () {
    if (!this.fileHandle.file) throw new DOMException(...GONE)
    this.fileHandle.file = this.file
    this.file =
    this.position =
    this.size = null!
    if (this.fileHandle.onclose) {
      this.fileHandle.onclose(this.fileHandle)
    }
  }
}

export class FileHandle implements FileSystemFileHandleAdapter {
  public file: File | null
  public readonly name: string
  public readonly kind = 'file'
  // TODO: check if we need this, b/c we can check file for null instead
  private deleted = false
  public writable: boolean
  public onclose?(self: this): void

  constructor (name = '', file = new File([], name), writable = true) {
    this.file = file
    this.name = name
    this.writable = writable
  }

  async getFile () {
    if (this.deleted || this.file === null) throw new DOMException(...GONE)
    return this.file
  }

  async createWritable (opts?: FileSystemCreateWritableOptions) {
    if (!this.writable) throw new DOMException(...DISALLOWED)
    if (this.deleted) throw new DOMException(...GONE)
    return new Sink(this, !!opts?.keepExistingData)
  }

  async isSameEntry (other: FileHandle) {
    return this === other
  }

  destroy () {
    this.deleted = true
    this.file = null
  }
}

export class FolderHandle implements FileSystemFolderHandleAdapter {
  public readonly name: string
  public readonly kind = 'directory'
  private deleted = false
  public _entries: Record<string, FolderHandle | FileHandle> = {}
  public writable: boolean

  constructor (name: string, writable = true) {
    this.name = name
    this.writable = writable
  }

  async * entries () {
    if (this.deleted) throw new DOMException(...GONE)
    yield* Object.entries(this._entries)
  }

  async isSameEntry (other: FolderHandle) {
    return this === other
  }

  async getDirectoryHandle (name: string, opts: { create?: boolean; } = {}) {
    if (this.deleted) throw new DOMException(...GONE)
    const entry = this._entries[name]
    if (entry) { // entry exist
      if (entry instanceof FileHandle) {
        throw new DOMException(...MISMATCH)
      } else {
        return entry
      }
    } else {
      if (opts.create) {
        return (this._entries[name] = new FolderHandle(name))
      } else {
        throw new DOMException(...GONE)
      }
    }
  }

  async getFileHandle (name: string, opts: { create?: boolean; } = {}) {
    const entry = this._entries[name]
    if (entry) {
      if (entry instanceof FileHandle) {
        return entry
      } else {
        throw new DOMException(...MISMATCH)
      }
    } else {
      if (!opts.create) {
        throw new DOMException(...GONE)
      } else {
        return (this._entries[name] = new FileHandle(name))
      }
    }
  }

  async removeEntry (name: string, opts: { recursive?: boolean; } = {}) {
    const entry = this._entries[name]
    if (!entry) throw new DOMException(...GONE)
    entry.destroy(opts.recursive)
    delete this._entries[name]
  }

  destroy (recursive?: boolean) {
    for (let x of Object.values(this._entries)) {
      if (!recursive) throw new DOMException(...MOD_ERR)
      x.destroy(recursive)
    }
    this._entries = {}
    this.deleted = true
  }
}

const fs = new FolderHandle('')

const adapter: Adapter<void> = () => fs

export default adapter
