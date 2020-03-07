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
  if (!data.rs) data.rs = createStream(evt.ports[0])
  map.set(data.url, data)
})

function createStream (port) {
  // ReadableStream is only supported by chrome 52
  return new ReadableStream({
    start (ctrl) {
      // When we receive data on the messageChannel, we write
      port.onmessage = ({ data }) => {
        if (data === 'end') {
          return ctrl.close()
        }

        if (data === 'abort') {
          ctrl.error('Aborted the download')
          return
        }

        ctrl.enqueue(data)
      }
    },
    cancel () {
      port.postMessage('canceled')
    }
  })
}

globalThis.addEventListener('fetch', evt => {
  const url = evt.request.url
  const data = map.get(url)
  if (!data) return null
  map.delete(url)
  evt.respondWith(new Response(data.rs, {
    headers: data.headers
  }))
})
