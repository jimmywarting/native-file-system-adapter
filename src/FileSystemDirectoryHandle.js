import FileSystemHandle from './FileSystemHandle.js'

const kAdapter = Symbol('adapter')

class FileSystemDirectoryHandle extends FileSystemHandle {
  /** @type {FileSystemDirectoryHandle} */
  [kAdapter]

  constructor (adapter) {
    super(adapter)
    this[kAdapter] = adapter
  }

  /**
   * @param {string} name Name of the directory
   * @param {object} [options]
   * @param {boolean} [options.create] create the directory if don't exist
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async getDirectoryHandle (name, options = {}) {
    if (name === '') {
      throw new TypeError(`Name can't be an empty string.`)
    }
    if (name === '.' || name === '..' || name.includes('/')) {
      throw new TypeError(`Name contains invalid characters.`)
    }
    options.create = !!options.create
    const handle = await this[kAdapter].getDirectoryHandle(name, options)
    return new FileSystemDirectoryHandle(handle)
  }

  /** @returns {AsyncGenerator<[string, FileSystemHandle | FileSystemDirectoryHandle]>} */
  async * entries () {
    const {FileSystemFileHandle} = await import('./FileSystemFileHandle.js')

    for await (const [_, entry] of this[kAdapter].entries())
      yield [entry.name, entry.kind === 'file'
        ? new FileSystemFileHandle(entry)
        : new FileSystemDirectoryHandle(entry)]
  }

  /** @deprecated use .entries() instead */
  async * getEntries() {
    const {FileSystemFileHandle} = await import('./FileSystemFileHandle.js')
    console.warn('deprecated, use .entries() instead')
    for await (let entry of this[kAdapter].entries())
      yield entry.kind === 'file'
        ? new FileSystemFileHandle(entry)
        : new FileSystemDirectoryHandle(entry)
  }

  /**
   * @param {string} name Name of the file
   * @param {object} [options]
   * @param {boolean} [options.create] create the file if don't exist
   */
  async getFileHandle (name, options = {}) {
    const {FileSystemFileHandle} = await import('./FileSystemFileHandle.js')
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) {
      throw new TypeError(`Name contains invalid characters.`)
    }
    options.create = !!options.create
    const handle = await this[kAdapter].getFileHandle(name, options)
    return new FileSystemFileHandle(handle)
  }

  /**
   * @param {string} name
   * @param {object} [options]
   * @param {boolean} [options.recursive]
   */
  async removeEntry (name, options = {}) {
    if (name === '') {
      throw new TypeError(`Name can't be an empty string.`)
    }
    if (name === '.' || name === '..' || name.includes('/')) {
      throw new TypeError(`Name contains invalid characters.`)
    }
    options.recursive = !!options.recursive // cuz node's fs.rm require boolean
    return this[kAdapter].removeEntry(name, options)
  }

  async resolve (possibleDescendant) {
    if (await possibleDescendant.isSameEntry(this)) {
      return []
    }

    const openSet = [{ handle: this, path: [] }]

    while (openSet.length) {
      let { handle: current, path } = openSet.pop()
      for await (const entry of current.values()) {
        if (await entry.isSameEntry(possibleDescendant)) {
          return [...path, entry.name]
        }
        if (entry.kind === 'directory') {
          openSet.push({ handle: entry, path: [...path, entry.name] })
        }
      }
    }

    return null
  }

  async * keys () {
    for await (const [name] of this[kAdapter].entries())
      yield name
  }

  async * values () {
    for await (const [_, entry] of this)
      yield entry
  }

  [Symbol.asyncIterator]() {
    return this.entries()
  }
}

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
export { FileSystemDirectoryHandle }
