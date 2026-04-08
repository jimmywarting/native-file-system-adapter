import config from './config.js'

const { DOMException } = config

const kAdapter = Symbol('adapter')

/**
 * A synchronous handle to a file in the Origin Private File System (or any
 * adapter that supports synchronous access).
 *
 * All methods are synchronous — no Promises, no async/await.
 *
 * Obtain an instance via `fileHandle.createSyncAccessHandle()`.
 *
 * @see https://fs.spec.whatwg.org/#api-filesystemsyncaccesshandle
 */
class FileSystemSyncAccessHandle {
  /** @type {object} */
  [kAdapter]

  /** @type {number} Internal file position cursor, advanced by read/write when `at` is omitted. */
  _filePositionCursor = 0

  /** @type {boolean} */
  _closed = false

  /**
   * @param {object} adapter  Synchronous adapter implementing:
   *   read(buffer: Uint8Array, at: number): number
   *   write(buffer: Uint8Array, at: number): number
   *   truncate(newSize: number): void
   *   getSize(): number
   *   flush(): void
   *   close(): void
   */
  constructor (adapter) {
    this[kAdapter] = adapter
  }

  /** @throws {DOMException} InvalidStateError if the handle is closed. */
  _checkClosed () {
    if (this._closed) {
      throw new DOMException(
        'The access handle was already closed.',
        'InvalidStateError'
      )
    }
  }

  /**
   * Synchronously read bytes from the file into `buffer`.
   *
   * @param {ArrayBuffer | SharedArrayBuffer | ArrayBufferView} buffer  Destination buffer.
   * @param {{ at?: number }} [options={}]  When `at` is given, read starts there and the
   *   file position cursor is NOT advanced.  When omitted, the cursor is used and advanced.
   * @returns {number}  Number of bytes actually read.
   */
  read (buffer, options = {}) {
    this._checkClosed()
    const view = toUint8Array(buffer)
    const at = options.at !== undefined ? options.at : this._filePositionCursor
    const bytesRead = this[kAdapter].read(view, at)
    if (options.at === undefined) {
      this._filePositionCursor = at + bytesRead
    }
    return bytesRead
  }

  /**
   * Synchronously write bytes from `buffer` into the file.
   *
   * If `writePosition` is past the end of the file the gap is zero-filled.
   *
   * @param {ArrayBuffer | SharedArrayBuffer | ArrayBufferView} buffer  Source buffer.
   * @param {{ at?: number }} [options={}]  When `at` is given, writing starts there and
   *   the file position cursor is NOT advanced.  When omitted, the cursor is used and advanced.
   * @returns {number}  Number of bytes written (always `buffer.byteLength`).
   */
  write (buffer, options = {}) {
    this._checkClosed()
    const view = toUint8Array(buffer)
    const at = options.at !== undefined ? options.at : this._filePositionCursor
    const bytesWritten = this[kAdapter].write(view, at)
    if (options.at === undefined) {
      this._filePositionCursor = at + bytesWritten
    }
    return bytesWritten
  }

  /**
   * Truncate (or zero-extend) the file to exactly `newSize` bytes.
   * If the current file position cursor is greater than `newSize`, it is reset to `newSize`.
   *
   * @param {number} newSize
   */
  truncate (newSize) {
    this._checkClosed()
    if (this._filePositionCursor > newSize) {
      this._filePositionCursor = newSize
    }
    this[kAdapter].truncate(newSize)
  }

  /**
   * Returns the current byte length of the file.
   *
   * @returns {number}
   */
  getSize () {
    this._checkClosed()
    return this[kAdapter].getSize()
  }

  /**
   * Persist any pending changes to the underlying storage.
   * For in-memory adapters this is a no-op; for disk-backed adapters it
   * calls `fsync`.
   */
  flush () {
    this._checkClosed()
    this[kAdapter].flush()
  }

  /**
   * Close the access handle and release the exclusive lock on the file.
   * Calling `close()` on an already-closed handle is a no-op.
   */
  close () {
    if (this._closed) return
    this._closed = true
    this[kAdapter].close()
  }
}

/**
 * Return a `Uint8Array` view over the same memory as `buffer`.
 * Works with `ArrayBuffer`, `SharedArrayBuffer`, and any `ArrayBufferView`.
 *
 * @param {ArrayBuffer | SharedArrayBuffer | ArrayBufferView} buffer
 * @returns {Uint8Array}
 */
function toUint8Array (buffer) {
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }
  return new Uint8Array(buffer)
}

Object.defineProperties(FileSystemSyncAccessHandle.prototype, {
  [Symbol.toStringTag]: {
    value: 'FileSystemSyncAccessHandle',
    enumerable: false,
    writable: false,
    configurable: true
  },
  read: { enumerable: true },
  write: { enumerable: true },
  truncate: { enumerable: true },
  getSize: { enumerable: true },
  flush: { enumerable: true },
  close: { enumerable: true }
})

export default FileSystemSyncAccessHandle
export { FileSystemSyncAccessHandle }
