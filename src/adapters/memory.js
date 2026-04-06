import { errors } from '../util.js'
import config from '../config.js'

const { File, Blob, DOMException } = config
const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, SECURITY, DISALLOWED, NO_MOD } = errors

export class Sink {

  /**
   * @param {FileHandle} fileHandle
   * @param {File} file
   */
  constructor (fileHandle, file) {
    this.fileHandle = fileHandle
    this.file = file
    this.size = file.size
    this.position = 0
    this._hasLock = true
    this.fileHandle._openWritables++
  }

  _releaseLock () {
    if (this._hasLock) {
      this.fileHandle._openWritables--
      this._hasLock = false
    }
  }

  write (chunk) {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    let file = this.file

    try {
      if (typeof chunk === 'object' && chunk !== null && !(chunk instanceof Blob) && !ArrayBuffer.isView(chunk) && !(chunk instanceof ArrayBuffer)) {
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
        } else {
          // If it's an object but not a Blob, BufferSource, or valid WriteParams, it's invalid.
          throw new TypeError('Invalid data passed to write()')
        }
      }

      if (chunk === null || (typeof chunk !== 'string' && !(chunk instanceof Blob) && !ArrayBuffer.isView(chunk) && !(chunk instanceof ArrayBuffer))) {
        throw new TypeError('Invalid data passed to write()')
      }

      if (chunk instanceof Blob && chunk._handle?._deleted) {
        throw new DOMException(...GONE)
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
      try {
        blob = new File([
          head,
          new Uint8Array(padding),
          chunk,
          tail
        ], blob.name)
      } catch (err) {
        throw new DOMException(...GONE)
      }

      this.size = blob.size
      this.position += chunk.size

      this.file = blob
    } catch (err) {
      this._releaseLock()
      throw err
    }
  }
  abort () {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    this._releaseLock()
    this.file =
    this.position =
    this.size = null
  }
  close () {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    this.fileHandle._file = this.file
    this._releaseLock()
    this.file =
    this.position =
    this.size = null
    if (this.fileHandle.onclose) {
      this.fileHandle.onclose(this.fileHandle)
    }
  }
}

export class FileHandle {
  constructor (name = '', file = new File([], name), writable = true, parent = null) {
    this._file = file
    this.name = name
    this.kind = 'file'
    this._deleted = false
    this.writable = writable
    this.readable = true
    this._parent = parent
    this._openWritables = 0
  }

  async getFile () {
    if (this._deleted) throw new DOMException(...GONE)
    const file = this._file
    // @ts-ignore
    file._handle = this
    return file
  }

  async createWritable (opts) {
    if (!this.writable) throw new DOMException(...DISALLOWED)
    if (this._deleted) throw new DOMException(...GONE)

    const file = opts.keepExistingData
      ? await this.getFile()
      : new File([], this.name)

    return new Sink(this, file)
  }

  async isSameEntry (other) {
    if (this === other) return true
    if (this.kind !== other.kind) return false
    
    // Compare paths by traversing up to the root
    const getPath = (handle) => {
      const parts = []
      let current = handle
      while (current) {
        parts.unshift(current.name)
        current = current._parent
      }
      return parts.join('/')
    }
    
    return getPath(this) === getPath(other)
  }

  async move (dest, newName) {
    if (this._deleted) throw new DOMException(...GONE)
    if (this._openWritables > 0) throw new DOMException(...NO_MOD)

    if (newName === '') throw new TypeError('Name cannot be empty.')
    if (newName && (newName.includes('/') || newName.includes('\\') || newName === '.' || newName === '..')) {
      throw new TypeError('Name contains invalid characters.')
    }

    const name = newName || this.name
    dest = dest || this._parent

    if (!dest) throw new DOMException(...GONE)
    if (dest.kind !== 'directory') throw new DOMException(...MISMATCH)

    if (dest._entries[name]) {
      const entry = dest._entries[name]
      if (entry === this) return
      if (entry.kind === 'directory') throw new DOMException(...INVALID)
      // Mutate the existing entry to point to our file
      // This is needed because WPT expects existing handles to see the new content
      if (entry instanceof FileHandle) {
        if (entry._openWritables > 0) throw new DOMException(...NO_MOD)
        entry._file = this._file
        // We still need to remove the source from its parent
        if (this._parent) {
          delete this._parent._entries[this.name]
        }
        return
      }
      await entry._destroy()
    }

    if (this._parent) {
      delete this._parent._entries[this.name]
    }
    this.name = name
    this._parent = dest
    dest._entries[name] = this
  }

  async _destroy () {
    if (this._openWritables > 0) throw new DOMException(...NO_MOD)
    this._deleted = true
    this._file = null
  }

  async remove () {
    if (this._deleted) throw new DOMException(...GONE)
    await this._destroy()
    if (this._parent) {
      const name = this.name
      delete this._parent._entries[name]
    }
  }
}

export class FolderHandle {

  /** @param {string} name */
  constructor (name, writable = true, parent = null) {
    this.name = name
    this.kind = 'directory'
    this._deleted = false
    /** @type {Object.<string, (FolderHandle|FileHandle)>} */
    this._entries = {}
    this.writable = writable
    this.readable = true
    this._parent = parent
    this._openWritables = 0
  }

  /** @returns {AsyncGenerator<[string, FileHandle | FolderHandle]>} */
  async * entries () {
    if (this._deleted) throw new DOMException(...GONE)
    yield* Object.entries(this._entries)
  }

  async isSameEntry (other) {
    if (this === other) return true
    if (this.kind !== other.kind) return false
    
    // Compare paths by traversing up to the root
    const getPath = (handle) => {
      const parts = []
      let current = handle
      while (current) {
        parts.unshift(current.name)
        current = current._parent
      }
      return parts.join('/')
    }
    
    return getPath(this) === getPath(other)
  }

  /**
   * @param {string} name
   * @param {{ create: boolean; }} opts
   */
  async getDirectoryHandle (name, opts) {
    if (this._deleted) throw new DOMException(...GONE)
    const entry = this._entries[name]
    if (entry) { // entry exist
      if (entry instanceof FileHandle) {
        throw new DOMException(...MISMATCH)
      } else {
        return entry
      }
    } else {
      if (opts.create) {
        return (this._entries[name] = new FolderHandle(name, true, this))
      } else {
        throw new DOMException(...GONE)
      }
    }
  }

  /**
   * @param {string} name
   * @param {{ create: boolean; }} opts
   */
  async getFileHandle (name, opts) {
    const entry = this._entries[name]
    const isFile = entry instanceof FileHandle
    if (entry && isFile) return entry
    if (entry && !isFile) throw new DOMException(...MISMATCH)
    if (!entry && !opts.create) throw new DOMException(...GONE)
    if (!entry && opts.create) {
      return (this._entries[name] = new FileHandle(name, new File([], name, { lastModified: Date.now() }), true, this))
    }
  }

  async removeEntry (name, opts) {
    const entry = this._entries[name]
    if (!entry) throw new DOMException(...GONE)
    await entry._destroy(opts.recursive)
    delete this._entries[name]
  }

  async _destroy (recursive) {
    // Check for locks first
    const checkLocks = (handle) => {
      if (handle.kind === 'file' && handle._openWritables > 0) return true
      if (handle.kind === 'directory') {
        for (const entry of Object.values(handle._entries)) {
          if (checkLocks(entry)) return true
        }
      }
      return false
    }

    if (checkLocks(this)) throw new DOMException(...NO_MOD)

    for (let x of Object.values(this._entries)) {
      if (!recursive) throw new DOMException(...MOD_ERR)
      await x._destroy(recursive)
    }
    this._entries = {}
    this._deleted = true
  }

  async remove (options = {}) {
    if (this._deleted) throw new DOMException(...GONE)
    if (!this._parent) {
      // Clear root
      for (const name of Object.keys(this._entries)) {
        await this.removeEntry(name, { recursive: true })
      }
      return
    }
    if (!options.recursive && Object.keys(this._entries).length > 0) {
      throw new DOMException(...MOD_ERR)
    }
    await this._destroy(!!options.recursive)
    if (this._parent) {
      const name = this.name
      delete this._parent._entries[name]
    }
  }
}

export default () => new FolderHandle('')
