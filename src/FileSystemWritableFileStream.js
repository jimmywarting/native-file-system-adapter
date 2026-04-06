import config from './config.js'
import { errors } from './util.js'

const { WritableStream, DOMException, Blob: BlobCtor } = config
const { INVALID, SYNTAX } = errors

/**
 * FileSystemWritableFileStream wraps an adapter Sink and provides the
 * full WHATWG FileSystemWritableFileStream API.
 *
 * Adapter Sinks are now expected to implement a minimal interface:
 *   sink.size          – initial file size (number, read once at construction)
 *   sink.write(blob, position) – write a Blob at the given byte offset
 *   sink.truncate(size)        – shrink or zero-extend the file to `size` bytes
 *   sink.close()               – commit changes
 *   sink.abort()               – discard changes
 *
 * All WriteParams parsing ({ type: 'write'|'seek'|'truncate', … }),
 * write-position tracking, and seek/truncate validation are handled here
 * so that adapter Sinks stay as thin as possible.
 */
class FileSystemWritableFileStream extends WritableStream {
  #writer
  constructor (sink) {
    // Track position and size for WriteParams dispatch.
    // The adapter's sink exposes its initial file size via `sink.size`.
    let position = 0
    let size = typeof sink.size === 'number' ? sink.size : 0

    const underlyingSink = {
      async write (chunk) {
        // ── WriteParams dispatch ──────────────────────────────────────────
        if (
          typeof chunk === 'object' &&
          chunk !== null &&
          !(chunk instanceof BlobCtor) &&
          !ArrayBuffer.isView(chunk) &&
          !(chunk instanceof ArrayBuffer)
        ) {
          if (chunk.type === 'write') {
            if (Number.isInteger(chunk.position) && chunk.position >= 0) {
              // Extend the file with zeros if the target position is past EOF.
              if (size < chunk.position) {
                await sink.truncate(chunk.position)
                size = chunk.position
              }
              position = chunk.position
            }
            if (!('data' in chunk)) {
              throw new DOMException(...SYNTAX('write requires a data argument'))
            }
            chunk = chunk.data
          } else if (chunk.type === 'seek') {
            if (Number.isInteger(chunk.position) && chunk.position >= 0) {
              if (size < chunk.position) throw new DOMException(...INVALID)
              position = chunk.position
              return
            }
            throw new DOMException(...SYNTAX('seek requires a position argument'))
          } else if (chunk.type === 'truncate') {
            if (Number.isInteger(chunk.size) && chunk.size >= 0) {
              await sink.truncate(chunk.size)
              size = chunk.size
              if (position > size) position = size
              return
            }
            throw new DOMException(...SYNTAX('truncate requires a size argument'))
          } else {
            throw new TypeError('Invalid data passed to write()')
          }
        }

        // ── Raw-data write ────────────────────────────────────────────────
        if (
          chunk === null ||
          (typeof chunk !== 'string' &&
            !(chunk instanceof BlobCtor) &&
            !ArrayBuffer.isView(chunk) &&
            !(chunk instanceof ArrayBuffer))
        ) {
          throw new TypeError('Invalid data passed to write()')
        }

        // Normalise to a Blob so adapters only need to handle one type.
        const blob = chunk instanceof BlobCtor ? chunk : new BlobCtor([chunk])
        await sink.write(blob, position)
        position += blob.size
        size = Math.max(size, position)
      },

      async close () {
        return sink.close()
      },

      async abort (reason) {
        return sink.abort(reason)
      }
    }

    super(underlyingSink)
    this.#writer = underlyingSink
    // Stupid Safari hack to extend native classes
    // https://bugs.webkit.org/show_bug.cgi?id=226201
    Object.setPrototypeOf(this, FileSystemWritableFileStream.prototype)

    /** @private */
    this._closed = false
  }

  async close () {
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

  // The write(data) method steps are:
  write (data) {
    if (this._closed) {
      return Promise.reject(new TypeError('Cannot write to a CLOSED writable stream'))
    }

    // 1. Let writer be the result of getting a writer for this.
    const writer = this.getWriter()

    // 2. Let result be the result of writing a chunk to writer given data.
    const result = writer.write(data)

    // 3. Release writer.
    writer.releaseLock()

    // 4. Return result.
    return result
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

// Safari safari doesn't support writable streams yet.
if (
  globalThis.FileSystemFileHandle &&
  !globalThis.FileSystemFileHandle.prototype.createWritable &&
  !globalThis.FileSystemWritableFileStream
) {
  globalThis.FileSystemWritableFileStream = FileSystemWritableFileStream
}

export default FileSystemWritableFileStream
export { FileSystemWritableFileStream }
