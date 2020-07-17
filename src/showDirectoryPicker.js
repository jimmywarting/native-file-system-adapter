const native = globalThis.showDirectoryPicker

/**
 * @param {Object} [options]
 * @param {boolean} [options.multiple] If you want to allow more than one file
 * @param {string} [options._name] the name to fall back to when using polyfill
 * @param {boolean} [options._preferPolyfill] If you rather want to use the polyfill instead of the native
 * @returns Promise<FileSystemDirectoryHandle>
 */
async function showDirectoryPicker (options = {}) {
  if (native && !options._preferPolyfill) {
    return native(options)
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = !!options.multiple
  input.webkitdirectory = true

  return new Promise(rs => {
    const p = import('./util.js').then(m => m.fromInput)
    input.onchange = () => rs(p.then(fn => fn(input)))
    input.click()
  })
}

export default showDirectoryPicker
