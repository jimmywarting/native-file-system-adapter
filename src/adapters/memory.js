import { errors } from '../util.js'
/** @type {typeof window.File} */
const File = globalThis.File || await import('fetch-blob/file.js').then(m => m.File)
/** @type {typeof window.Blob} */
const Blob = globalThis.Blob || await import('fetch-blob').then(m => m.Blob)

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, SECURITY, DISALLOWED } = errors

export class Sink {
  /** @param {FileHandle} fileHandle */
  constructor (fileHandle) {
    this.fileHandle = fileHandle
    this.file = fileHandle.file
    this.size = fileHandle.file.size
    this.position = 0
  }
  write (chunk) {
    let file = this.file

    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
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
            : new File([file, new Uint8Array(chunk.size - this.size)], file.name)

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
  close () {
    if (this.fileHandle.deleted) throw new DOMException(...GONE)
    this.fileHandle.file = this.file
    this.file =
    this.position =
    this.size = null
    if (this.fileHandle.onclose) {
      this.fileHandle.onclose(this.fileHandle)
    }
  }
}

export class FileHandle {
  constructor (name = '', file = new File([], name), writable = true) {
    this.file = file
    this.name = name
    this.kind = 'file'
    this.deleted = false
    this.writable = writable
    this.readable = true
  }

  getFile () {
    if (this.deleted) throw new DOMException(...GONE)
    return this.file
  }

  createWritable (opts) {
    if (!this.writable) throw new DOMException(...DISALLOWED)
    if (this.deleted) throw new DOMException(...GONE)
    return new Sink(this)
  }

  isSameEntry (other) {
    return this === other
  }

  destroy () {
    this.deleted = true
    this.file = null
  }
}

export class FolderHandle {

  /** @param {string} name */
  constructor (name, writable = true) {
    this.name = name
    this.kind = 'directory'
    this.deleted = false
    /** @type {Object.<string, (FolderHandle|FileHandle)>} */
    this._entries = {}
    this.writable = writable
    this.readable = true
  }

  async * entries () {
    if (this.deleted) throw new DOMException(...GONE)
    yield* Object.entries(this._entries)
  }

  isSameEntry (other) {
    return this === other
  }

  /** @param {string} name */
  getDirectoryHandle (name, opts = {}) {
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

  /** @param {string} name */
  getFileHandle (name, opts = {}) {
    const entry = this._entries[name]
    const isFile = entry instanceof FileHandle
    if (entry && isFile) return entry
    if (entry && !isFile) throw new DOMException(...MISMATCH)
    if (!entry && !opts.create) throw new DOMException(...GONE)
    if (!entry && opts.create) {
      return (this._entries[name] = new FileHandle(name))
    }
  }

  removeEntry (name, opts) {
    const entry = this._entries[name]
    if (!entry) throw new DOMException(...GONE)
    entry.destroy(opts.recursive)
    delete this._entries[name]
  }

  destroy (recursive) {
    for (let x of Object.values(this._entries)) {
      if (!recursive) throw new DOMException(...MOD_ERR)
      x.destroy(recursive)
    }
    this._entries = {}
    this.deleted = true
  }
}

const fs = new FolderHandle('')

export default opts => fs
