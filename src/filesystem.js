const ChooseFileSystemEntriesType = [
  'open-file',
  'save-file',
  'open-directory'
]

const def = {
  type: 'openFile',
  accepts: []
}
const native = globalThis.chooseFileSystemEntries

/**
 * @param {Object} [options]
 * @param {('openFile'|'saveFile'|'openDirectory')} [options.type] type of operation to make
 * @param {boolean} [options.multiple] If you want to allow more than one file
 * @param {boolean} [options.excludeAcceptAllOption=false] Prevent user for selecting any
 * @param {Object[]} [options.accepts] Files you want to accept
 * @param {string} [options._name] the name to fall back to when using polyfill
 * @param {boolean} [options._preferPolyfill] If you rather want to use the polyfill instead of the native
 * @returns Promise<FileSystemDirectoryHandle>
 */
async function chooseFileSystemEntries (options = {}) {
  const opts = { ...def, ...options }
  if (native && opts._preferPolyfill !== true) {
    return native(opts)
  }
  if (!ChooseFileSystemEntriesType.includes(opts.type)) {
    throw new TypeError(`The provided value '${
      opts.type
    }' is not a valid enum value of type ChooseFileSystemEntriesType.`)
  }

  if (opts.type === 'saveFile') {
    const FileSystemFileHandle = await import('./FileSystemFileHandle.js').then(d => d.default)
    const { FileHandle } = await import('./adapters/downloader.js')
    return new FileSystemFileHandle(new FileHandle(opts._name))
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = opts.multiple
  input.webkitdirectory = opts.type === 'openDirectory'
  // input.accepts = opts.accepts[0].extensions
  input.accept = opts.accepts.map(e => [...(e.extensions || []).map(e=>'.'+e), ...e.mimeTypes || []]).flat().join(',')

  return new Promise(rs => {
    const p = import('./util.js').then(m => m.fromInput)
    // Detecting cancel btn is hard :[
    // there exist some browser hacks but they are vary diffrent,
    // hacky or no good.
    input.onchange = () => rs(p.then(fn => fn(input)))
    input.click()
  })
}

export default chooseFileSystemEntries
