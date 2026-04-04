/** @typedef {import('./FileSystemFileHandle.js').default} FileSystemFileHandle */

const native = globalThis.showSaveFilePicker

/**
 * @typedef {'native' | 'sw-transferable-stream' | 'sw-message-channel' | 'constructing-blob'} SaveFileMethod
 */

/**
 * @param {Object} [options]
 * @param {boolean} [options.excludeAcceptAllOption=false] Prevent user for selecting any
 * @param {Object[]} [options.types] Files you want to accept
 * @param {string} [options.suggestedName] the name to fall back to when using polyfill
 * @param {boolean} [options._preferPolyfill] Deprecated. Use _preferredMethods instead.
 * @param {SaveFileMethod[]} [options._preferredMethods] Ordered list of preferred methods
 * @return {Promise<FileSystemFileHandle>}
 */
async function showSaveFilePicker (options = {}) {
  // Backward compat: convert _preferPolyfill to _preferredMethods
  let methods = options._preferredMethods
  if (!methods) {
    if (options._preferPolyfill) {
      methods = ['sw-transferable-stream', 'sw-message-channel', 'constructing-blob']
    } else {
      methods = ['native', 'sw-transferable-stream', 'sw-message-channel', 'constructing-blob']
    }
  }

  // Iterate methods in order — only try native when it appears in sequence
  for (const method of methods) {
    if (method === 'native' && native) {
      return native(options)
    }
    if (method !== 'native') {
      break
    }
  }

  const polyfillMethods = methods.filter(m => m !== 'native')
  const { FileSystemFileHandle } = await import('./FileSystemFileHandle.js')
  const { FileHandle } = await import('./adapters/downloader.js')
  return new FileSystemFileHandle(new FileHandle(options.suggestedName, polyfillMethods))
}

export default showSaveFilePicker
export { showSaveFilePicker }
