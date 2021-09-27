/** @type {typeof WritableStream} */
const ws = globalThis.WritableStream || await import('https://cdn.jsdelivr.net/npm/web-streams-polyfill@3/dist/ponyfill.es2018.mjs').then(r => r.WritableStream).catch(() => import('web-streams-polyfill').then(r => r.WritableStream))

// TODO: add types for ws
class FileSystemWritableFileStream extends ws {
  constructor (...args) {
    super(...args)

    // Stupid Safari hack to extend native classes
    // https://bugs.webkit.org/show_bug.cgi?id=226201
    Object.setPrototypeOf(this, FileSystemWritableFileStream.prototype)

    /** @private */
    this._closed = false
  }

  close () {
    this._closed = true
    const w = this.getWriter()
    const p = w.close()
    w.releaseLock()
    return p
    // return super.close ? super.close() : this.getWriter().close()
  }

  /** @param {number} position */
  seek (position) {
    return this.write({ type: 'seek', position })
  }

  /** @param {number} size */
  truncate (size) {
    return this.write({ type: 'truncate', size })
  }

  write (data) {
    if (this._closed) {
      return Promise.reject(new TypeError('Cannot write to a CLOSED writable stream'))
    }

    const writer = this.getWriter()
    const p = writer.write(data)
    writer.releaseLock()
    return p
  }
}

Object.defineProperty(FileSystemWritableFileStream.prototype, Symbol.toStringTag, {
  value: 'FileSystemWritableFileStream',
  writable: false,
  enumerable: false,
  configurable: true
})

Object.defineProperties(FileSystemWritableFileStream.prototype, {
  close: { enumerable: true },
  seek: { enumerable: true },
  truncate: { enumerable: true },
  write: { enumerable: true }
})

export default FileSystemWritableFileStream
export { FileSystemWritableFileStream }
