import { errors } from '../util.js'
import config from '../config.js'

const {
  WritableStream,
  TransformStream,
  DOMException,
  Blob
} = config

const { GONE } = errors
// @ts-ignore - Don't match newer versions of Safari, but that's okay
const isOldSafari = /constructor/i.test(window.HTMLElement)

/** Detect if the browser supports transferring ReadableStreams via postMessage */
function supportsTransferableStreams () {
  try {
    const rs = new ReadableStream()
    const { port1, port2 } = new MessageChannel()
    port1.postMessage(rs, [rs])
    port1.close()
    port2.close()
    return true
  } catch {
    return false
  }
}

/**
 * Send a ping to the service worker and wait for an acknowledgment.
 * Returns true if the SW responds with { pong: true }, false otherwise.
 * @param {ServiceWorkerRegistration} sw
 * @param {number} [timeout=1000]
 * @returns {Promise<boolean>}
 */
function checkServiceWorkerReady (sw, timeout = 1000) {
  return new Promise(resolve => {
    if (!sw?.active) return resolve(false)
    const { port1, port2 } = new MessageChannel()
    const timer = setTimeout(() => {
      port1.close()
      port2.close()
      resolve(false)
    }, timeout)
    port1.onmessage = evt => {
      clearTimeout(timer)
      port1.close()
      resolve(evt.data && evt.data.pong === true)
    }
    sw.active.postMessage({ type: 'ping' }, [port2])
  })
}

export class FileHandle {
  /**
   * @param {string} [name]
   * @param {('sw-transferable-stream' | 'sw-message-channel' | 'constructing-blob')[]} [methods]
   */
  constructor (name = 'unkown', methods = ['constructing-blob']) {
    this.name = name
    this.kind = 'file'
    this._methods = methods
  }

  async getFile () {
    throw new DOMException(...GONE)
  }

  async isSameEntry(other) {
    return this === other
  }

  /**
   * Try each preferred method in order. For SW methods, verify the
   * service worker actually supports downloads via a ping/pong handshake.
   * Falls back gracefully to the next method in the list.
   * @param {object} [options={}]
   */
  async createWritable (options = {}) {
    let methods = this._methods

    // Old Safari can't handle service worker streams
    if (isOldSafari) {
      methods = ['constructing-blob']
    }

    // Pre-check SW availability once if any SW method is in the list
    const needsSW = methods.some(m => m === 'sw-transferable-stream' || m === 'sw-message-channel')
    let sw, swReady
    if (needsSW) {
      sw = await navigator.serviceWorker?.getRegistration()
      swReady = sw ? await checkServiceWorkerReady(sw) : false
    }

    for (const method of methods) {
      if (method === 'sw-transferable-stream') {
        if (swReady && supportsTransferableStreams()) {
          return this._createSWWritable(sw, 'sw-transferable-stream', options)
        }
        continue
      }
      if (method === 'sw-message-channel') {
        if (swReady) {
          return this._createSWWritable(sw, 'sw-message-channel', options)
        }
        continue
      }
      if (method === 'constructing-blob') {
        return this._createBlobWritable()
      }
    }

    // Ultimate fallback
    return this._createBlobWritable()
  }

  /** @private */
  _createBlobWritable () {
    const link = document.createElement('a')
    const ts = new TransformStream()
    const sink = ts.writable

    link.download = this.name

    /** @type {Blob[]} */
    let chunks = []
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

    return sink.getWriter()
  }

  /**
   * @private
   * @param {ServiceWorkerRegistration} sw
   * @param {'sw-transferable-stream' | 'sw-message-channel'} method
   * @param {object} options
   */
  _createSWWritable (sw, method, options) {
    const ts = new TransformStream()
    const sink = ts.writable

    // Make filename RFC5987 compatible
    const fileName = encodeURIComponent(this.name).replace(/['()]/g, escape).replace(/\*/g, '%2A')
    const headers = {
      'content-disposition': "attachment; filename*=UTF-8''" + fileName,
      'content-type': 'application/octet-stream; charset=utf-8',
      ...(options.size ? { 'content-length': options.size } : {})
    }

    const keepAlive = setInterval(() => sw.active.postMessage(0), 10000)

    const toUint8 = new TransformStream({
      transform (chunk, ctrl) {
        if (chunk instanceof Uint8Array) return ctrl.enqueue(chunk)
        const reader = new Response(chunk).body.getReader()
        const pump = _ => reader.read().then(e => e.done ? 0 : pump(ctrl.enqueue(e.value)))
        return pump()
      }
    })

    if (method === 'sw-transferable-stream') {
      // Preferred: transfer the ReadableStream directly to the service worker
      ts.readable.pipeTo(toUint8.writable).finally(() => {
        clearInterval(keepAlive)
      })

      sw.active.postMessage({
        url: sw.scope + fileName,
        headers,
        readable: toUint8.readable
      }, [toUint8.readable])
    } else {
      // Fallback: use MessagePort-based stream transfer
      const { writable, readablePort } = new RemoteWritableStream(WritableStream)

      ts.readable.pipeThrough(toUint8).pipeTo(writable).finally(() => {
        clearInterval(keepAlive)
      })

      sw.active.postMessage({
        url: sw.scope + fileName,
        headers,
        readablePort
      }, [readablePort])
    }

    // Trigger the download with a hidden iframe
    const iframe = document.createElement('iframe')
    iframe.hidden = true
    iframe.src = sw.scope + fileName
    document.body.appendChild(iframe)

    return sink.getWriter()
  }
}

// Want to remove this postMessage hack, tell them u want transferable streams:
// https://bugs.webkit.org/show_bug.cgi?id=215485

const WRITE = 0
const PULL = 0
const ERROR = 1
const ABORT = 1
const CLOSE = 2

class MessagePortSink {
  /** @param {MessagePort} port */
  constructor (port) {
    port.onmessage = event => this._onMessage(event.data)
    this._port = port
    this._resetReady()
  }

  start (controller) {
    this._controller = controller
    // Apply initial backpressure
    return this._readyPromise
  }

  write (chunk) {
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

  abort (reason) {
    this._port.postMessage({ type: ABORT, reason })
    this._port.close()
  }

  _onMessage (message) {
    if (message.type === PULL) this._resolveReady()
    if (message.type === ERROR) this._onError(message.reason)
  }

  _onError (reason) {
    this._controller.error(reason)
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
    this._readyResolve()
    this._readyPending = false
  }

  _rejectReady (reason) {
    if (!this._readyPending) this._resetReady()
    this._readyPromise.catch(() => {})
    this._readyReject(reason)
    this._readyPending = false
  }
}

class RemoteWritableStream {
  constructor (WritableStream) {
    const channel = new MessageChannel()
    this.readablePort = channel.port1
    this.writable = new WritableStream(
      new MessagePortSink(channel.port2)
    )
  }
}
