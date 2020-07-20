import { errors } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, SECURITY, DISALLOWED } = errors

export class FileHandle {
  constructor (name, file) {
    this.name = name
    this.kind = 'file'
  }
  getFile () {
    throw new DOMException(...GONE)
  }
  async createWritable (opts) {
    const sw = await navigator.serviceWorker.getRegistration()
    // @ts-ignore
    const useBlobFallback = !sw || /constructor/i.test(window.HTMLElement) || !!window.safari
    let sink

    if (useBlobFallback) {
      const link = document.createElement('a')
      link.download = this.name
      let chunks = []
      sink = {
        write (chunk) {
          chunks.push(new Blob([chunk]))
        },
        close (something) {
          const blob = new Blob(chunks, { type: 'application/octet-stream; charset=utf-8' })
          chunks = []
          link.href = URL.createObjectURL(blob)
          link.click()
          setTimeout(() => {
            URL.revokeObjectURL(link.href)
          }, 10000)
        }
      }
    } else {
      // Make filename RFC5987 compatible
      const fileName = encodeURIComponent(this.name).replace(/['()]/g, escape).replace(/\*/g, '%2A')
      const headers = {
        'Content-Disposition': "attachment; filename*=UTF-8''" + fileName,
        'Content-Type': 'application/octet-stream; charset=utf-8',
        ...(opts.size ? { 'Content-Length': opts.size } : {})
      }

      try {
        /****************************************/
        /* Canary mostly (transferable streams) */
        /****************************************/
        console.log('canary')
        const ts = new TransformStream({
          async transform (chunk, ctrl) {
            return new Response(chunk).body.pipeTo(new WritableStream({
              write (chunk) {
                return ctrl.enqueue(chunk)
              }
            }))
          }
        })
        sink = ts.writable.getWriter()
        // @ts-ignore
        sw.active.postMessage({
          rs: ts.readable,
          url: sw.scope + fileName,
          headers
        }, [ ts.readable ])
      } catch (err) {
        console.log(err)
        /****************************************/
        /* MessageChannel fallback              */
        /****************************************/
        console.log('chrome, firefox, opera')
        const mc = new MessageChannel()
        const interval = setInterval(() => {
          sw.active.postMessage('ping')
        }, 5000)

        sink = {
          async write (chunk) {
            const reader = new Response(chunk).body.getReader()
            const pump = _ => reader.read()
              .then(res => res.done ? '' : pump(mc.port1.postMessage(res.value)))
            return pump()
          },
          close () {
            clearInterval(interval)
            mc.port1.postMessage('end')
          }
        }
        sw.active.postMessage({
          url: sw.scope + fileName,
          headers
        }, [ mc.port2 ])
      }

      const iframe = document.createElement('iframe')
      iframe.hidden = true
      iframe.src = sw.scope + fileName
      document.body.appendChild(iframe)
    }

    return sink
  }
}
