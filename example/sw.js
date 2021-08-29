const WRITE = 0
const PULL = 0
const ERROR = 1
const ABORT = 1
const CLOSE = 2
const PING = 3

/** @implements {UnderlyingSource} */
class MessagePortSource {

  /** @type {ReadableStreamController<any>} controller */
  controller

  /** @param {MessagePort} port */
  constructor (port) {
    this.port = port;
    this.port.onmessage = evt => this.onMessage(evt.data)
  }

  /**
   * @param {ReadableStreamController<any>} controller
   */
  start (controller) {
    this.controller = controller
  }

  /** @param {Error} reason */
  cancel (reason) {
    // Firefox can notify a cancel event, chrome can't
    // https://bugs.chromium.org/p/chromium/issues/detail?id=638494
    this.port.postMessage({ type: ERROR, reason: reason.message })
    this.port.close()
  }

  /** @param {{ type: number; chunk: Uint8Array; reason: any; }} message */
  onMessage (message) {
    // enqueue() will call pull() if needed when there's no backpressure
    if (message.type === WRITE) {
      this.controller.enqueue(message.chunk)
      this.port.postMessage({ type: PULL })
    }
    if (message.type === ABORT) {
      this.controller.error(message.reason)
      this.port.close()
    }
    if (message.type === CLOSE) {
      this.controller.close()
      this.port.close()
    }
  }
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

const map = new Map()

// This should be called once per download
// Each event has a dataChannel that the data will be piped through
globalThis.addEventListener('message', evt => {
  const data = evt.data
  if (data.url && data.readablePort) {
    data.rs = new ReadableStream(
      new MessagePortSource(evt.data.readablePort),
      new CountQueuingStrategy({ highWaterMark: 4 })
    )
    map.set(data.url, data)
  }
})

globalThis.addEventListener('fetch', evt => {
  const url = evt.request.url
  const data = map.get(url)
  if (!data) return null
  map.delete(url)
  evt.respondWith(new Response(data.rs, {
    headers: data.headers
  }))
})
