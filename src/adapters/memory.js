import { errors } from '../util.js'
import config from '../config.js'
import { BlobSink } from './blobsink.js'

const { File, Blob, DOMException } = config
const { GONE, MISMATCH, MOD_ERR, SYNTAX, DISALLOWED, NO_MOD } = errors

/**
 * Recursively serialize a FolderHandle's subtree into a plain object whose
 * File children are included verbatim (suitable for IndexedDB storage).
 *
 * @param {FolderHandle} folder
 * @returns {{ kind: 'directory', name: string, children: object }}
 */
function serializeTree (folder) {
  const children = {}
  for (const [name, entry] of Object.entries(folder._entries)) {
    if (entry instanceof FileHandle) {
      children[name] = { kind: 'file', name, file: entry._file }
    } else {
      children[name] = serializeTree(entry)
    }
  }
  return { kind: 'directory', name: folder.name, children }
}

/**
 * Recursively reconstruct a FolderHandle subtree from a plain object produced
 * by `serializeTree()`.
 *
 * @param {{ kind: string, name: string, children?: object, file?: File }} node
 * @param {FolderHandle|null} parent
 * @returns {FileHandle|FolderHandle}
 */
function reconstructTree (node, parent) {
  if (node.kind === 'file') {
    return new FileHandle(node.name, node.file || new File([], node.name), true, parent)
  }
  const folder = new FolderHandle(node.name, true, parent)
  for (const [name, child] of Object.entries(node.children || {})) {
    folder._entries[name] = reconstructTree(child, folder)
  }
  return folder
}

export class Sink extends BlobSink {

  /**
   * @param {FileHandle} fileHandle
   * @param {File} file
   */
  constructor (fileHandle, file) {
    super(file)
    this.fileHandle = fileHandle
    this._hasLock = true
    this.fileHandle._openWritables++
  }

  _releaseLock () {
    if (this._hasLock) {
      this.fileHandle._openWritables--
      this._hasLock = false
    }
  }

  /**
   * Write a Blob at the given position (called by the outer
   * FileSystemWritableFileStream after WriteParams have been parsed).
   *
   * @param {Blob} blob
   * @param {number} position
   */
  write (blob, position) {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    // @ts-ignore
    if (blob._handle?._deleted) throw new DOMException(...GONE)
    try {
      super.write(blob, position)
    } catch (_err) {
      this._releaseLock()
      throw new DOMException(...GONE)
    }
  }

  /**
   * @param {number} size
   */
  truncate (size) {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    super.truncate(size)
  }

  abort () {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    this._releaseLock()
    this.file = this.size = null
  }
  close () {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    this.fileHandle._file = this.file
    this._releaseLock()
    this.file = this.size = null
    if (this.fileHandle.onclose) {
      this.fileHandle.onclose(this.fileHandle)
    }
  }
}

/**
 * A Sink that writes directly into the FileHandle's backing File in-place,
 * rather than buffering in a separate BlobSink and committing on close.
 * Writes are immediately visible via getFile(); abort() cannot undo them.
 */
export class InPlaceSink {
  /**
   * @param {FileHandle} fileHandle
   */
  constructor (fileHandle) {
    this.fileHandle = fileHandle
    this.size = fileHandle._file.size
    this._hasLock = true
    fileHandle._openWritables++
  }

  _releaseLock () {
    if (this._hasLock) {
      this.fileHandle._openWritables--
      this._hasLock = false
    }
  }

  /**
   * @param {Blob} blob
   * @param {number} position
   */
  write (blob, position) {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    // @ts-ignore
    if (blob._handle?._deleted) throw new DOMException(...GONE)
    const file = this.fileHandle._file
    const head = file.slice(0, position)
    const tail = file.slice(position + blob.size)
    this.fileHandle._file = new File([head, blob, tail], file.name)
    this.size = this.fileHandle._file.size
  }

  /**
   * @param {number} size
   */
  truncate (size) {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    const file = this.fileHandle._file
    this.fileHandle._file = size < file.size
      ? new File([file.slice(0, size)], file.name, file)
      : new File([file, new Uint8Array(size - file.size)], file.name)
    this.size = this.fileHandle._file.size
  }

  abort () {
    // In-place writes cannot be rolled back.
    this._releaseLock()
  }

  close () {
    if (this.fileHandle._deleted) throw new DOMException(...GONE)
    this._releaseLock()
    if (this.fileHandle.onclose) {
      this.fileHandle.onclose(this.fileHandle)
    }
  }
}

/**
 * Synchronous adapter for the in-memory FileHandle.
 *
 * On construction it receives a `Uint8Array` copy of the file's current
 * content.  All read/write/truncate operations work on that copy in memory.
 * `flush()` and `close()` write the copy back to the owning `FileHandle`.
 */
export class MemorySyncAdapter {
  /**
   * @param {FileHandle} fileHandle
   * @param {Uint8Array} bytes  Current file content copied into a mutable buffer.
   */
  constructor (fileHandle, bytes) {
    this._fileHandle = fileHandle
    this._bytes = bytes
    this._size = bytes.length
  }

  /**
   * @param {Uint8Array} buffer  Destination to fill.
   * @param {number} at  Byte offset to start reading from.
   * @returns {number}  Bytes actually read.
   */
  read (buffer, at) {
    if (at >= this._size) return 0
    const readEnd = Math.min(at + buffer.length, this._size)
    const bytesRead = readEnd - at
    buffer.set(this._bytes.subarray(at, readEnd))
    return bytesRead
  }

  /**
   * @param {Uint8Array} buffer  Source bytes to write.
   * @param {number} at  Byte offset to start writing at.
   * @returns {number}  Bytes written (always `buffer.length`).
   */
  write (buffer, at) {
    const end = at + buffer.length
    if (end > this._size) {
      // Grow internal buffer, zero-filling the gap between old size and `at`.
      const grown = new Uint8Array(end)
      grown.set(this._bytes.subarray(0, this._size))
      this._bytes = grown
      this._size = end
    }
    this._bytes.set(buffer, at)
    return buffer.length
  }

  /** @param {number} newSize */
  truncate (newSize) {
    if (newSize < this._size) {
      const shrunk = new Uint8Array(newSize)
      shrunk.set(this._bytes.subarray(0, newSize))
      this._bytes = shrunk
    } else if (newSize > this._size) {
      const grown = new Uint8Array(newSize)
      grown.set(this._bytes)
      this._bytes = grown
    }
    this._size = newSize
  }

  /** @returns {number} */
  getSize () {
    return this._size
  }

  /** Persist the current buffer back to the owning FileHandle's backing File. */
  flush () {
    if (this._fileHandle._deleted) throw new DOMException(...GONE)
    this._fileHandle._file = new File(
      [this._bytes.subarray(0, this._size)],
      this._fileHandle.name
    )
  }

  /** Flush and release the exclusive lock. */
  close () {
    if (!this._fileHandle._deleted) {
      this._fileHandle._file = new File(
        [this._bytes.subarray(0, this._size)],
        this._fileHandle.name
      )
    }
    if (this._fileHandle._openSyncHandles > 0) {
      this._fileHandle._openSyncHandles--
    }
    this._bytes = null
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
    this._openSyncHandles = 0
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
    // A sync access handle holds an exclusive lock — block all new writables.
    if (this._openSyncHandles > 0) throw new DOMException(...NO_MOD)

    const mode = opts.mode

    // Exclusive modes allow only one writer at a time.
    if (mode === 'exclusive-atomic' || mode === 'exclusive-in-place') {
      if (this._openWritables > 0) throw new DOMException(...NO_MOD)
    }

    if (mode === 'exclusive-in-place') {
      // Write directly to the backing File — no separate buffer, no commit on close.
      // If keepExistingData is false, truncate to empty immediately.
      if (!opts.keepExistingData) {
        this._file = new File([], this.name)
      }
      return new InPlaceSink(this)
    }

    // 'exclusive-atomic' and 'siloed' (default when mode is undefined) both buffer
    // writes in a BlobSink and commit atomically on close().
    const file = opts.keepExistingData
      ? await this.getFile()
      : new File([], this.name)

    return new Sink(this, file)
  }

  /**
   * Obtain a synchronous access handle.  Acquires an exclusive lock — no other
   * writable or sync access handle may be opened while this lock is held.
   *
   * @returns {Promise<MemorySyncAdapter>}
   */
  async createSyncAccessHandle () {
    if (!this.writable) throw new DOMException(...DISALLOWED)
    if (this._deleted) throw new DOMException(...GONE)
    if (this._openWritables > 0 || this._openSyncHandles > 0) {
      throw new DOMException(...NO_MOD)
    }
    // Eagerly materialise the current file content into a mutable Uint8Array.
    const bytes = new Uint8Array(await this._file.arrayBuffer())
    this._openSyncHandles++
    return new MemorySyncAdapter(this, bytes)
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
    if (this._openWritables > 0 || this._openSyncHandles > 0) throw new DOMException(...NO_MOD)

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
    if (this._openWritables > 0 || this._openSyncHandles > 0) throw new DOMException(...NO_MOD)
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

  serialize () {
    if (this._deleted) throw new DOMException(...GONE)
    return { adapter: `${import.meta.url}:FileHandle`, kind: this.kind, name: this.name, file: this._file }
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
      if (handle.kind === 'file' && (handle._openWritables > 0 || handle._openSyncHandles > 0)) return true
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

  serialize () {
    if (this._deleted) throw new DOMException(...GONE)
    return {
      adapter: `${import.meta.url}:FolderHandle`,
      kind: this.kind,
      name: this.name,
      root: serializeTree(this)
    }
  }
}

/**
 * Reconstruct a FileHandle or FolderHandle from data produced by a memory
 * adapter `serialize()` call.  Because all data is embedded in the serialized
 * object, no external root reference is needed.
 *
 * - A serialized FileHandle (`data.kind === 'file'`) is reconstructed from
 *   `data.file` (the original File object).
 * - A serialized FolderHandle (`data.kind === 'directory'`) is reconstructed
 *   from `data.root`, the full subtree snapshot.
 *
 * @param {{ kind: 'file'|'directory', name: string, file?: File, root?: object }} data
 * @returns {FileHandle|FolderHandle}
 */
export function deserialize (data) {
  if (!data || !data.kind || !data.name) {
    throw new TypeError('Invalid serialized handle data.')
  }
  if (data.kind === 'file') {
    return new FileHandle(data.name, data.file || new File([], data.name))
  }
  return reconstructTree(data.root || data, null)
}

export default () => new FolderHandle('')
