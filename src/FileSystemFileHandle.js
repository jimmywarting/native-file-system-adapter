import FileSystemHandle from './FileSystemHandle.js'
import FileSystemWritableFileStream from './FileSystemWritableFileStream.js'

const wm = new WeakMap()

class FileSystemFileHandle extends FileSystemHandle {
  constructor (meta) {
    super(meta)
    wm.set(this, meta)
  }

  /**
   * @param  {Object} [options={}]
   * @param  {boolean} [options.keepExistingData]
   * @return {Promise<FileSystemWritableFileStream>}
   */
  async createWritable (options = {}) {
    return new FileSystemWritableFileStream(
      await wm.get(this).createWritable(options)
    )
  }

  /**
   * @returns {Promise<File>}
   */
  getFile () {
    return Promise.resolve(wm.get(this).getFile())
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
