const native = globalThis.showDirectoryPicker

/**
 * @param {Object} [options]
 * @param {boolean} [options._preferPolyfill] If you rather want to use the polyfill instead of the native
 * @returns Promise<FileSystemDirectoryHandle>
 */
async function showDirectoryPicker (options = {}) {
  if (native && !options._preferPolyfill) {
    return native(options)
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.webkitdirectory = true

  return new Promise(rs => {
    const p = import('./util.js').then(m => m.fromInput)
    input.onchange = () => rs(p.then(fn => fn(input)))
    input.click()
  })
}

export default showDirectoryPicker
