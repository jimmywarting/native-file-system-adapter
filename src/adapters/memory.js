const INVALID = ['seeking position failed', 'InvalidStateError']
const GONE = ['A requested file or directory could not be found at the time an operation was processed', 'NotFoundError']
const MISMATCH = ['The path supplied exists, but was not an entry of requested type.', 'TypeMismatchError']
const MOD_ERR = ['The object can not be modified in this way.', 'InvalidModificationError']
const SYNTAX = m => [`Failed to execute 'write' on 'UnderlyingSinkBase': Invalid params passed. ${m}`, 'SyntaxError']
const SECURITY = ['It was determined that certain files are unsafe for access within a Web application, or that too many calls are being made on file resources.', 'SecurityError']
const DISALLOWED = ['The request is not allowed by the user agent or the platform in the current context.', 'NotAllowedError']

class Sink {
  constructor (fileHandle) {
    this.fileHandle = fileHandle
    this.file = fileHandle.file
    this.size = fileHandle.file.size
    this.position = 0
  }
  write (chunk) {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          if (this.size < chunk.position) {
            throw new DOMException(...INVALID)
          }
          this.position = chunk.position
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
          let file = this.file
          file = chunk.size < this.size
            ? file.slice(0, chunk.size)
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

    // Maybe shouldn't do this:
    // this.fileHandle.file = this.file
  }
  close () {
    if (this.fileHandle.deleted) throw new DOMException(...GONE)
    this.fileHandle.file = this.file
    this.file =
    this.position =
    this.size = null
  }
}

export class FileHandle {
  constructor (name, file, writable = true) {
    this.file = file || new File([], name)
    this.name = name
    this.isFile = true
    this.deleted = false
    this.writable = writable
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
  queryPermission () { return 'granted' }
  requestPermission (opts) { return 'granted' }
  destroy () {
    this.deleted = true
    this.file = null
  }
}

export class FolderHandle {
  constructor (name) {
    this.name = name
    this.isFile = false
    this.deleted = false
    this.entries = {}
  }
  async * getEntries () {
    if (this.deleted) throw new DOMException(...GONE)
    yield* Object.values(this.entries)
  }
  getDirectory (name, opts = {}) {
    if (this.deleted) throw new DOMException(...GONE)
    const entry = this.entries[name]
    if (entry) { // entry exist
      if (entry instanceof FileHandle) {
        throw new DOMException(...MISMATCH)
      } else {
        return entry
      }
    } else {
      if (opts.create) {
        return (this.entries[name] = new FolderHandle(name))
      } else {
        throw new DOMException(...GONE)
      }
    }
  }
  getFile (name, opts = {}) {
    const entry = this.entries[name]
    const isFile = entry instanceof FileHandle
    if (entry && isFile) return entry
    if (entry && !isFile) throw new DOMException(...MISMATCH)
    if (!entry && !opts.create) throw new DOMException(...GONE)
    if (!entry && opts.create) {
      return (this.entries[name] = new FileHandle(name))
    }
  }
  removeEntry (name, opts) {
    const entry = this.entries[name]
    if (!entry) throw new DOMException(...GONE)
    entry.destroy(opts.recursive)
    delete this.entries[name]
  }
  destroy (recursive) {
    for (let x of Object.values(this.entries)) {
      if (!recursive) throw new DOMException(...MOD_ERR)
      x.destroy(recursive)
    }
    this.entries = {}
    this.deleted = true
  }
}

const fs = new FolderHandle('')

export default opts => fs
