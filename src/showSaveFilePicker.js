const native = globalThis.showSaveFilePicker
const def = {
  accepts: []
}
/**
 * @param {Object} [options]
 * @param {boolean} [options.excludeAcceptAllOption=false] Prevent user for selecting any
 * @param {Object[]} [options.accepts] Files you want to accept
 * @param {string} [options._name] the name to fall back to when using polyfill
 * @param {boolean} [options._preferPolyfill] If you rather want to use the polyfill instead of the native
 * @returns Promise<FileSystemDirectoryHandle>
 */
async function showSaveFilePicker (options = {}) {
  if (native && !options._preferPolyfill) {
    return native(options)
  }

  const FileSystemFileHandle = await import('./FileSystemFileHandle.js').then(d => d.default)
  const { FileHandle } = await import('./adapters/downloader.js')
  return new FileSystemFileHandle(new FileHandle(options._name))
}

export default showSaveFilePicker
