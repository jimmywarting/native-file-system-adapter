import FileSystemHandle from './FileSystemHandle.js'
import FileSystemWritableFileStream from './FileSystemWritableFileStream.js'
import './createWritable.js'

const kAdapter = Symbol('adapter')

class FileSystemFileHandle extends FileSystemHandle {
  /** @type {FileSystemFileHandle} */
  [kAdapter]

  [Symbol.toStringTag] = 'FileSystemFileHandle'

  constructor (adapter) {
    super(adapter)
    this[kAdapter] = adapter
  }

  /**
   * @param  {Object} [options={}]
   * @param  {boolean} [options.keepExistingData]
   * @returns {Promise<FileSystemWritableFileStream>}
   */
  async createWritable (options = {}) {
    return new FileSystemWritableFileStream(
      await this[kAdapter].createWritable(options)
    )
  }

  /**
   * @returns {Promise<File>}
   */
  async getFile () {
    return this[kAdapter].getFile()
  }

  /**
   * @param {FileSystemDirectoryHandle|string} destinationDirectoryOrNewName
   * @param {string} [newName]
   */
  async move (destinationDirectoryOrNewName, newName) {
    let destinationDirectory
    if (typeof destinationDirectoryOrNewName === 'string') {
      newName = destinationDirectoryOrNewName
    } else {
      destinationDirectory = destinationDirectoryOrNewName
    }

    if (destinationDirectory) {
      // We need to access the adapter of the destination directory.
      // Since FileSystemHandle.js doesn't export kAdapter, we assume
      // it's the same kind of symbol if we define it here, but it's not.
      // However, we can use the fact that FileSystemDirectoryHandle also has a [kAdapter] property.
      // Since we don't have access to that symbol, we'll have to find it.
      const destAdapterSymbol = Object.getOwnPropertySymbols(destinationDirectory).find(
        s => s.description === 'adapter'
      )
      const destAdapter = destinationDirectory[destAdapterSymbol]
      await this[kAdapter].move(destAdapter, newName)
    } else {
      await this[kAdapter].move(undefined, newName)
    }
  }
}

Object.defineProperties(FileSystemFileHandle.prototype, {
  [Symbol.toStringTag]: {
    enumerable: false,
    writable: false,
    configurable: true,
  },
  createWritable: { enumerable: true },
  getFile: { enumerable: true },
  move: { enumerable: true }
})

export default FileSystemFileHandle
export { FileSystemFileHandle }
