// @ts-check

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
  async getDirectory (name, options = {}) {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) throw new TypeError(`Name contains invalid characters.`)
    return new FileSystemDirectoryHandle(await wm.get(this).getDirectory(name, options))
  }

  async * getEntries () {
    for await (let entry of wm.get(this).getEntries())
      yield entry.isFile ? new FileSystemFileHandle(entry) : new FileSystemDirectoryHandle(entry)
  }

  /**
   * @param  {string} name Name of the file
   * @param  {object} [options]
   * @param  {boolean} [options.create] create the file if don't exist
   * @returns {Promise<FileSystemFileHandle>}
   */
  async getFile (name, options) {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) throw new TypeError(`Name contains invalid characters.`)
    return new FileSystemFileHandle(await wm.get(this).getFile(name, options))
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

  /**
   * @param {object} options
   * @param {('sandbox')} options.type - type of system to get
   * @param {('indexeddb'|'memory'|'sandbox'|'native')} [options._driver] - type of system to get
   * @return {Promise<FileSystemDirectoryHandle>}
   */
  static async getSystemDirectory (options) {
    const err = `Failed to execute 'getSystemDirectory' on 'FileSystemDirectoryHandle': `
    const { _driver = 'native' } = options

    if (!arguments.length) {
      throw new TypeError(err + '1 argument required, but only 0 present.')
    }
    if (typeof options !== 'object') {
      throw new TypeError(err + `parameter 1 ('options') is not an object.`)
    }
    if (!options.hasOwnProperty('type')) {
      throw new TypeError(err + 'required member type is undefined.')
    }

    if (options._driver instanceof DataTransfer) {
      const entries = [...options._driver.items].map(item =>
        item.webkitGetAsEntry()
      )
      return import('./util.js').then(m => m.fromDataTransfer(entries))
    }

    if (options.type !== 'sandbox') {
      throw new TypeError(err + `The provided value '${options.type}' is not a valid enum value of type SystemDirectoryType.`)
    }

    if (_driver === 'native') {
      return globalThis.FileSystemDirectoryHandle.getSystemDirectory(options)
    }

    if (!['indexeddb', 'memory', 'sandbox', 'native'].includes(_driver)) {
      throw new TypeError('the adapter dont exist')
    }

    let module = await import(`./adapters/${_driver}.js`)
    const sandbox = await module.default(options)
    return new FileSystemDirectoryHandle(sandbox)
  }
}

FileSystemDirectoryHandle.prototype.isFile = false
FileSystemDirectoryHandle.prototype.name = ''
FileSystemDirectoryHandle.prototype.isDirectory = true

Object.defineProperty(FileSystemDirectoryHandle.prototype, Symbol.toStringTag, {
	value: 'FileSystemDirectoryHandle',
	writable: false,
	enumerable: false,
	configurable: true
})

Object.defineProperties(FileSystemDirectoryHandle.prototype, {
	getDirectory: { enumerable: true },
	getEntries: { enumerable: true },
	getFile: { enumerable: true },
	removeEntry: { enumerable: true }
})

export default FileSystemDirectoryHandle
