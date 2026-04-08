/** @typedef {import('./FileSystemDirectoryHandle.js').default} FileSystemDirectoryHandle */

if (globalThis.DataTransferItem && !DataTransferItem.prototype.getAsFileSystemHandle) {
  DataTransferItem.prototype.getAsFileSystemHandle = async function () {
    const entry = this.webkitGetAsEntry()
    const [
      { FileHandle, FolderHandle },
      { FileSystemDirectoryHandle },
      { FileSystemFileHandle }
    ] = await Promise.all([
      import('./adapters/sandbox.js'),
      import('./FileSystemDirectoryHandle.js'),
      import('./FileSystemFileHandle.js')
    ])

    return entry.isFile
      ? new FileSystemFileHandle(new FileHandle(entry, false))
      : new FileSystemDirectoryHandle(new FolderHandle(entry, false))
  }
}

/**
 * @param {object=} driver
 * @return {Promise<FileSystemDirectoryHandle|import('./FileSystemFileHandle.js').FileSystemFileHandle>}
 */
async function getOriginPrivateDirectory (driver, options = {}) {
  if (!driver) {
    return globalThis.navigator?.storage?.getDirectory() || globalThis.getOriginPrivateDirectory()
  }

  // Native (non-polyfill) FileSystemHandle passed directly — return as-is.
  if (globalThis.FileSystemHandle && driver instanceof globalThis.FileSystemHandle) {
    return driver
  }

  // Detect a serialized handle produced by serialize().
  // Serialized objects always have an `adapter` string field of the form
  // "<moduleUrl>:<ConstructorName>".  Adapter module objects (the other valid
  // argument type) never have an `adapter` property.
  if (typeof driver === 'object' && driver !== null && typeof driver.adapter === 'string') {
    const [
      { FileSystemDirectoryHandle },
      { FileSystemFileHandle }
    ] = await Promise.all([
      import('./FileSystemDirectoryHandle.js'),
      import('./FileSystemFileHandle.js')
    ])

    // Split on the LAST colon so that colons inside "file://" or "https://"
    // URLs are not accidentally included in the constructor name.
    const lastColon = driver.adapter.lastIndexOf(':')
    const moduleUrl = driver.adapter.slice(0, lastColon)
    const mod = await import(moduleUrl)

    if (typeof mod.deserialize !== 'function') {
      throw new TypeError(
        `Adapter at "${moduleUrl}" does not export a 'deserialize' function.`
      )
    }

    const adapterHandle = await mod.deserialize(driver)
    return driver.kind === 'file'
      ? new FileSystemFileHandle(adapterHandle)
      : new FileSystemDirectoryHandle(adapterHandle)
  }

  const {FileSystemDirectoryHandle} = await import('./FileSystemDirectoryHandle.js')
  const module = await driver
  const sandbox = await (module.default
    ? module.default(options)
    : module(options)
  )
  return new FileSystemDirectoryHandle(sandbox)
}

export default getOriginPrivateDirectory
