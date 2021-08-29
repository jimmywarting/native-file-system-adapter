import type { WriteChunk } from './interfaces'
import { WritableStream } from './web-streams-ponyfill.js'

const ws = globalThis.WritableStream || WritableStream

export class FileSystemWritableFileStream extends ws<WriteChunk> {
  /** @internal */
  private _closed = false

  constructor (underlyingSink?: UnderlyingSink, strategy?: QueuingStrategy) {
    super(underlyingSink, strategy)

    // Stupid Safari hack to extend native classes
    // https://bugs.webkit.org/show_bug.cgi?id=226201
    Object.setPrototypeOf(this, FileSystemWritableFileStream.prototype)
  }

  override close () {
    this._closed = true
    const w = this.getWriter()
    const p = w.close()
    w.releaseLock()
    return p
    // return super.close ? super.close() : this.getWriter().close()
  }

  seek (position: number) {
    return this.write({ type: 'seek', position })
  }

  truncate (size: number) {
    return this.write({ type: 'truncate', size })
  }

  write (data: WriteChunk) {
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
