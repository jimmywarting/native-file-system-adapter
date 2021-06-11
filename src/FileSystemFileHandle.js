import FileSystemHandle from './FileSystemHandle.js'
import FileSystemWritableFileStream from './FileSystemWritableFileStream.js'

class FileSystemFileHandle extends FileSystemHandle {
  /** @type {FileSystemFileHandle} */
  #adapter

  constructor (adapter) {
    super(adapter)
    this.#adapter = adapter
  }

  /**
   * @param  {Object} [options={}]
   * @param  {boolean} [options.keepExistingData]
   * @returns {Promise<FileSystemWritableFileStream>}
   */
  async createWritable (options = {}) {
    return new FileSystemWritableFileStream(
      await this.#adapter.createWritable(options)
    )
  }

  /**
   * @returns {Promise<File>}
   */
  getFile () {
    return Promise.resolve(this.#adapter.getFile())
  }
}

Object.defineProperty(FileSystemFileHandle.prototype, Symbol.toStringTag, {
  value: 'FileSystemFileHandle',
  writable: false,
  enumerable: false,
  configurable: true
})

Object.defineProperties(FileSystemFileHandle.prototype, {
  createWritable: { enumerable: true },
  getFile: { enumerable: true }
})

export default FileSystemFileHandle
export { FileSystemFileHandle }
