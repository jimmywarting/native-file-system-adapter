import FileSystemHandle from './FileSystemHandle.js'
import FileSystemFileHandle from './FileSystemFileHandle.js'

const wm = new WeakMap()

class FileSystemDirectoryHandle extends FileSystemHandle {
  constructor(meta) {
    super(meta)
    wm.set(this, meta)
    this.name = meta.name
  }

  /**
   * @param  {string} name Name of the directory
   * @param  {object} [options]
   * @param  {boolean} [options.create] create the directory if don't exist
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async getDirectoryHandle (name, options = {}) {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) throw new TypeError(`Name contains invalid characters.`)
    return new FileSystemDirectoryHandle(await wm.get(this).getDirectoryHandle(name, options))
  }

  async * entries () {
    for await (let entry of wm.get(this).entries())
      yield entry.kind === 'file' ? new FileSystemFileHandle(entry) : new FileSystemDirectoryHandle(entry)
  }

  /**
   * @deprecated use .entries() instead
   */
  getEntries() {
    console.warn('deprecated, use .entries() instead')
    return this.entries()
  }

  /**
   * @param  {string} name Name of the file
   * @param  {object} [options]
   * @param  {boolean} [options.create] create the file if don't exist
   * @returns {Promise<FileSystemFileHandle>}
   */
  async getFileHandle (name, options) {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) throw new TypeError(`Name contains invalid characters.`)
    return new FileSystemFileHandle(await wm.get(this).getFileHandle(name, options))
  }

  /**
   * @param {string} name
   * @param {object} options
   */
  async removeEntry (name, options = {}) {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) throw new TypeError(`Name contains invalid characters.`)
    return wm.get(this).removeEntry(name, options)
  }
}

FileSystemDirectoryHandle.prototype.kind = ''
FileSystemDirectoryHandle.prototype.name = ''

Object.defineProperty(FileSystemDirectoryHandle.prototype, Symbol.toStringTag, {
	value: 'FileSystemDirectoryHandle',
	writable: false,
	enumerable: false,
	configurable: true
})

Object.defineProperties(FileSystemDirectoryHandle.prototype, {
	getDirectoryHandle: { enumerable: true },
	entries: { enumerable: true },
	getFileHandle: { enumerable: true },
	removeEntry: { enumerable: true }
})

export default FileSystemDirectoryHandle
