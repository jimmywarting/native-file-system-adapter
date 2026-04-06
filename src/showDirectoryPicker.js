/** @typedef {import('./FileSystemDirectoryHandle.js').default} FileSystemDirectoryHandle */

const native = globalThis.showDirectoryPicker

/**
 * @param {Object} [options]
 * @param {('native' | 'input')[]} [options._preferredMethods] Ordered list of preferred methods
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function showDirectoryPicker (options = {}) {
  const methods = options._preferredMethods || ['native', 'input']

  for (const method of methods) {
    if (method === 'native' && native) {
      return native(options)
    }
    if (method === 'input') {
      break
    }
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.webkitdirectory = true
  // Fallback to multiple files input for iOS Safari
  input.multiple = true

  // See https://stackoverflow.com/questions/47664777/javascript-file-input-onchange-not-working-ios-safari-only
  input.style.position = 'fixed'
  input.style.top = '-100000px'
  input.style.left = '-100000px'
  document.body.appendChild(input)

  // Lazy load while the user is choosing the directory
  const p = import('./util.js')

  const evt = await new Promise(resolve => {
    input.onchange = input.onchange = resolve
    input.click()
  })

  input.onchange = input.onchange = null
  input.remove()

  if (evt.type === 'cancel') {
    throw new DOMException("Failed to execute 'showDirectoryPicker' on 'file input': The user aborted a request.", 'AbortError')
  }

  return p.then(mod => mod.getDirHandlesFromInput(input))
}

export default showDirectoryPicker
export { showDirectoryPicker }
