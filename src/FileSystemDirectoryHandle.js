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

    if (!arguments.length) {
      throw new TypeError(err + '1 argument required, but only 0 present.')
    }
    if (typeof options !== 'object') {
      throw new TypeError(err + `parameter 1 ('options') is not an object.`)
    }
    if (!options.hasOwnProperty('type')) {
      throw new TypeError(err + 'required member type is undefined.')
    }

    if (options.type instanceof HTMLInputElement) {
      const input = options.type
      const { FolderHandle, FileHandle } = await import('./adapters/memory.js')
      let files = Array.from(input.files)
      if (input.webkitdirectory) {
        const rootName = files[0].webkitRelativePath.split('/', 1)[0]
        const root = new FolderHandle(rootName)
        files.forEach(file => {
          const path = file.webkitRelativePath.split('/')
          path.shift()
          const name = path.pop()
          const dir = path.reduce((dir, path) => {
            if (!dir.entries[path]) dir.entries[path] = new FolderHandle(path)
            return dir.entries[path]
          }, root)
          dir.entries[name] = new FileHandle(file.name, file, false)
        })
        return new FileSystemDirectoryHandle(root)
      } else {
        const files = Array.from(input.files).map(file =>
          new FileSystemFileHandle(new FileHandle(file.name, file, false))
        )
        if (input.multiple) {
          return files
        } else {
          return files[0]
        }
      }
    }

    if (options.type !== 'sandbox') {
      throw new TypeError(err + `The provided value '${options.type}' is not a valid enum value of type SystemDirectoryType.`)
    }

    if (options._driver === 'native') {
      return globalThis.FileSystemDirectoryHandle.getSystemDirectory(options)
    }

    if (!['indexeddb', 'memory', 'sandbox', 'native'].includes(options._driver)) {
      throw new TypeError('the adapter dont exist')
    }

    let module = await import(`./adapters/${options._driver}.js`)
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
