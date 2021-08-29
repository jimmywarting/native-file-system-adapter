import { FileSystemFileHandleAdapter, WriteChunk } from '../interfaces.js'
import { errors } from '../util.js'

const { GONE } = errors
// @ts-ignore
const isSafari = /constructor/i.test(window.HTMLElement) || window.safari || window.WebKitPoint

export class FileHandle implements FileSystemFileHandleAdapter {
  readonly name: string
  readonly kind = 'file'
  writable = true

  constructor (name = 'unknown') {
    this.name = name
  }

  async getFile (): Promise<never> {
    throw new DOMException(...GONE)
  }

  async createWritable (options: FileSystemCreateWritableOptions & { size?: number } = {}) {
    if (options.keepExistingData) throw new TypeError(`Option keepExistingData is not implemented`)

    const TransformStream = globalThis.TransformStream || (await import('../web-streams-ponyfill.js')).TransformStream
    const WritableStream = globalThis.WritableStream || (await import('../web-streams-ponyfill.js')).WritableStream

    const sw = await navigator.serviceWorker?.getRegistration()
    const link = document.createElement('a')
    const ts = new TransformStream<WriteChunk>()
    const sink = ts.writable

    link.download = this.name

    if (isSafari || !sw) {
      let chunks: Blob[] = []
      ts.readable.pipeTo(new WritableStream({
        write (chunk) {
          chunks.push(new Blob([chunk]))
        },
        close () {
          const blob = new Blob(chunks, { type: 'application/octet-stream; charset=utf-8' })
          chunks = []
          link.href = URL.createObjectURL(blob)
          link.click()
          setTimeout(() => URL.revokeObjectURL(link.href), 10000)
        }
      }))
    } else {
      const { writable, readablePort } = new RemoteWritableStream(WritableStream)
      // Make filename RFC5987 compatible
      const fileName = encodeURIComponent(this.name).replace(/['()]/g, escape).replace(/\*/g, '%2A')
      const headers = {
        'content-disposition': "attachment; filename*=UTF-8''" + fileName,
        'content-type': 'application/octet-stream; charset=utf-8',
        ...(options.size ? { 'content-length': options.size } : {})
      }

      const keepAlive = setTimeout(() => sw.active!.postMessage(0), 10000)

      ts.readable.pipeThrough(new TransformStream<Blob | BufferSource | string>({
        transform (chunk, ctrl) {
          if (chunk instanceof Uint8Array) return ctrl.enqueue(chunk)
          const reader = new Response(chunk).body!.getReader()
          const pump = (_: void): Promise<any> => reader.read().then(e => e.done ? 0 : pump(ctrl.enqueue(e.value)))
          return pump()
        }
      })).pipeTo(writable).finally(() => {
        clearInterval(keepAlive)
      })

      // Transfer the stream to service worker
      sw.active!.postMessage({
        url: sw.scope + fileName,
        headers,
        readablePort
      }, [readablePort])

      // Trigger the download with a hidden iframe
      const iframe = document.createElement('iframe')
      iframe.hidden = true
      iframe.src = sw.scope + fileName
      document.body.appendChild(iframe)
    }

    return sink.getWriter()
  }

  async isSameEntry(other: FileHandle) {
    return this === other
  }
}

const WRITE = 0
const PULL = 0
const ERROR = 1
const ABORT = 1
const CLOSE = 2

class MessagePortSink implements UnderlyingSink<ArrayBufferView> {
  private _port: MessagePort
  private _controller: WritableStreamDefaultController | undefined
  private _readyPromise: Promise<void> | undefined
  private _readyResolve: (() => void) | undefined
  private _readyReject: ((e: unknown) => void) | undefined
  private _readyPending = false

  constructor (port: MessagePort) {
    this._port = port
    this._resetReady()
    this._port.onmessage = event => this._onMessage(event.data)
  }

  start (controller: WritableStreamDefaultController) {
    this._controller = controller
    // Apply initial backpressure
    return this._readyPromise
  }

  write (chunk: ArrayBufferView) {
    const message = { type: WRITE, chunk }

    // Send chunk
    this._port.postMessage(message, [chunk.buffer])

    // Assume backpressure after every write, until sender pulls
    this._resetReady()

    // Apply backpressure
    return this._readyPromise
  }

  close () {
    this._port.postMessage({ type: CLOSE })
    this._port.close()
  }

  abort (reason: unknown) {
    this._port.postMessage({ type: ABORT, reason })
    this._port.close()
  }

  _onMessage (message: any) {
    if (message.type === PULL) this._resolveReady()
    if (message.type === ERROR) this._onError(message.reason)
  }

  _onError (reason: unknown) {
    this._controller!.error(reason)
    this._rejectReady(reason)
    this._port.close()
  }

  _resetReady () {
    this._readyPromise = new Promise((resolve, reject) => {
      this._readyResolve = resolve
      this._readyReject = reject
    })
    this._readyPending = true
  }

  _resolveReady () {
    this._readyResolve!()
    this._readyPending = false
  }

  _rejectReady (reason: unknown) {
    if (!this._readyPending) this._resetReady()
    this._readyPromise!.catch(() => {})
    this._readyReject!(reason)
    this._readyPending = false
  }
}

class RemoteWritableStream {
  writable: globalThis.WritableStream
  readablePort: MessagePort

  constructor (WritableStream: typeof globalThis.WritableStream) {
    const channel = new MessageChannel()
    this.readablePort = channel.port1
    this.writable = new WritableStream(
      new MessagePortSink(channel.port2)
    )
  }
}
