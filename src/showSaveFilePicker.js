/** @typedef {import('./FileSystemFileHandle.js').default} FileSystemFileHandle */

const native = globalThis.showSaveFilePicker

/**
 * @typedef {'native' | 'sw-transferable-stream' | 'sw-message-channel' | 'constructing-blob'} SaveFileMethod
 */

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
 * @param {Object} [options]
 * @param {boolean} [options.excludeAcceptAllOption=false] Prevent user for selecting any
 * @param {Object[]} [options.types] Files you want to accept
 * @param {string} [options.suggestedName] the name to fall back to when using polyfill
 * @param {string} [options._name] the name to fall back to when using polyfill
 * @param {boolean} [options._preferPolyfill] Deprecated. Use _preferredMethods instead.
 * @param {SaveFileMethod[]} [options._preferredMethods] Ordered list of preferred methods
 * @return {Promise<FileSystemFileHandle>}
 */
async function showSaveFilePicker (options = {}) {
  // Backward compat: convert _preferPolyfill to _preferredMethods
  let methods = options._preferredMethods
  if (!methods) {
    if (options._preferPolyfill) {
      methods = ['constructing-blob']
    } else {
      methods = ['native', 'sw-transferable-stream', 'sw-message-channel', 'constructing-blob']
    }
  }

  // Check which capabilities are available
  const hasNative = !!native
  const sw = typeof navigator !== 'undefined' && navigator.serviceWorker
    ? await navigator.serviceWorker.getRegistration()
    : undefined
  const hasSW = !!sw
  const hasTransferable = hasSW && supportsTransferableStreams()

  for (const method of methods) {
    if (method === 'native' && hasNative) {
      return native(options)
    }
    if (method === 'sw-transferable-stream' && hasTransferable) {
      return _createPolyfillHandle(options, 'sw-transferable-stream')
    }
    if (method === 'sw-message-channel' && hasSW) {
      return _createPolyfillHandle(options, 'sw-message-channel')
    }
    if (method === 'constructing-blob') {
      return _createPolyfillHandle(options, 'constructing-blob')
    }
  }

  // If no method worked, fall back to constructing-blob
  return _createPolyfillHandle(options, 'constructing-blob')
}

/**
 * @param {object} options
 * @param {'sw-transferable-stream' | 'sw-message-channel' | 'constructing-blob'} method
 */
async function _createPolyfillHandle (options, method) {
  if (options._name) {
    console.warn('deprecated _name, spec now have `suggestedName`')
    options.suggestedName = options._name
  }
  const { FileSystemFileHandle } = await import('./FileSystemFileHandle.js')
  const { FileHandle } = await import('./adapters/downloader.js')
  return new FileSystemFileHandle(new FileHandle(options.suggestedName, method))
}

export default showSaveFilePicker
export { showSaveFilePicker }
