/** @typedef {import('./FileSystemFileHandle.js').default} FileSystemFileHandle */

const def = { accepts: [] }
const native = globalThis.showOpenFilePicker

/**
 * @param {Object} [options]
 * @param {boolean} [options.multiple] If you want to allow more than one file
 * @param {boolean} [options.excludeAcceptAllOption=false] Prevent user for selecting any
 * @param {Object[]} [options.accepts] Files you want to accept
 * @param {('native' | 'input')[]} [options._preferredMethods] Ordered list of preferred methods
 * @returns {Promise<FileSystemFileHandle[]>}
 */
async function showOpenFilePicker (options = {}) {
  const opts = { ...def, ...options }

  const methods = options._preferredMethods || ['native', 'input']

  for (const method of methods) {
    if (method === 'native' && native) {
      return native(opts)
    }
    if (method === 'input') {
      break
    }
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = opts.multiple
  input.accept = (opts.accepts || [])
    .map(e => [
      ...(e.extensions || []).map(e => '.' + e),
      ...e.mimeTypes || []]
    )
    .flat()
    .join(',')

  // See https://stackoverflow.com/questions/47664777/javascript-file-input-onchange-not-working-ios-safari-only
  Object.assign(input.style, {
    position: 'fixed',
    top: '-100000px',
    left: '-100000px'
  })

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
    throw new DOMException("Failed to execute 'showOpenFilePicker' on 'file input': The user aborted a request.", 'AbortError')
  }

  return p.then(m => m.getFileHandlesFromInput(input))
}

export default showOpenFilePicker
export { showOpenFilePicker }
