import FileSystemDirectoryHandle from './FileSystemDirectoryHandle.js'

/**
 * @param {object=} driver
 * @return {Promise<FileSystemDirectoryHandle>}
 */
async function getOriginPrivateDirectory (driver, options = {}) {
  if (typeof DataTransfer === 'function' && driver instanceof DataTransfer) {
    const entries = [driver.items].map(item =>
      // @ts-ignore
      item.webkitGetAsEntry()
    )
    return import('./util.js').then(m => m.fromDataTransfer(entries))
  }
  if (!driver) {
    return globalThis.getOriginPrivateDirectory()
  }
  let module = await driver
  const sandbox = module.default ? await module.default(options) : module(options)
  return new FileSystemDirectoryHandle(sandbox)
}

export default getOriginPrivateDirectory
