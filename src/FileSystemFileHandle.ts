import { FileSystemHandle } from './FileSystemHandle.js'
import { FileSystemFileHandleAdapter } from './interfaces.js'

const kAdapter = Symbol('adapter')

export class FileSystemFileHandle extends FileSystemHandle implements globalThis.FileSystemFileHandle {
  /** @internal */
  [kAdapter]: FileSystemFileHandleAdapter
  override readonly kind = 'file'

  constructor (adapter: FileSystemFileHandleAdapter) {
    super(adapter)
    this[kAdapter] = adapter
  }

  async createWritable (options: FileSystemCreateWritableOptions = {}) {
    const { FileSystemWritableFileStream } = await import('./FileSystemWritableFileStream.js')
    return new FileSystemWritableFileStream(
      await this[kAdapter].createWritable(options)
    )
  }

  async getFile () {
    return this[kAdapter].getFile()
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
