const def = {
  accepts: []
}
const native = globalThis.showOpenFilePicker

/**
 * @param {Object} [options]
 * @param {boolean} [options.multiple] If you want to allow more than one file
 * @param {boolean} [options.excludeAcceptAllOption=false] Prevent user for selecting any
 * @param {Object[]} [options.accepts] Files you want to accept
 * @param {boolean} [options._preferPolyfill] If you rather want to use the polyfill instead of the native
 * @returns Promise<FileSystemDirectoryHandle>
 */
async function showOpenFilePicker (options = {}) {
  const opts = { ...def, ...options }

  if (native && !options._preferPolyfill) {
    return native(opts)
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = opts.multiple
  input.accept = opts.accepts.map(e => [...(e.extensions || []).map(e => '.' + e), ...e.mimeTypes || []]).flat().join(',')

  return new Promise(resolve => {
    const p = import('./util.js').then(m => m.fromInput)
    input.onchange = () => resolve(p.then(fn => fn(input)))
    input.click()
  })
}

export default showOpenFilePicker
export { showOpenFilePicker }
