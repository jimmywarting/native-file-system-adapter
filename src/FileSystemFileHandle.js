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
   * @param  {'exclusive-atomic' | 'exclusive-in-place' | 'siloed'} [options.mode]
   *   Controls the write strategy and concurrency semantics (adapter-specific).
   *   - `'exclusive-atomic'`: Only one writable at a time; writes go to a
   *     temporary swap file committed atomically on `close()`.
   *   - `'exclusive-in-place'`: Only one writable at a time; writes go
   *     directly to the underlying file.  `abort()` cannot undo already-written data.
   *   - `'siloed'`: Multiple writables may be open simultaneously; each uses its
   *     own independent buffer where supported (memory/node), or the adapter's
   *     native write model (e.g. deno writes in-place).  Last `close()` wins.
   *   When omitted the adapter uses its own default strategy: memory and node use
   *   siloed (swap buffer per writer); deno writes in-place with no lock.
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
