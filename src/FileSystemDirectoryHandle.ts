import { FileSystemHandle } from './FileSystemHandle.js'
import { FileSystemFileHandle } from './FileSystemFileHandle.js'
import { FileSystemFolderHandleAdapter } from './interfaces.js'

const kAdapter = Symbol('adapter')

export class FileSystemDirectoryHandle extends FileSystemHandle implements globalThis.FileSystemDirectoryHandle {
  /** @internal */
  [kAdapter]: FileSystemFolderHandleAdapter
  override readonly kind = 'directory'

  constructor (adapter: FileSystemFolderHandleAdapter) {
    super(adapter)
    this[kAdapter] = adapter
  }

  async getDirectoryHandle (name: string, options: FileSystemGetDirectoryOptions = {}) {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) throw new TypeError(`Name contains invalid characters.`)
    return new FileSystemDirectoryHandle(await this[kAdapter].getDirectoryHandle(name, options))
  }

  /** @deprecated */
  getDirectory(name: string, options: FileSystemGetDirectoryOptions = {}) {
    return this.getDirectoryHandle(name, options)
  }

  async * entries () {
    for await (const [_, entry] of this[kAdapter].entries())
      yield [
        entry.name,
        entry.kind === 'file' ? new FileSystemFileHandle(entry) : new FileSystemDirectoryHandle(entry)
      ] as [string, FileSystemFileHandle | FileSystemDirectoryHandle]
  }

  /** @deprecated */
  async * getEntries() {
    return this.entries()
  }

  async * keys () {
    for await (const [name] of this[kAdapter].entries())
      yield name
  }

  async * values () {
    for await (const [_, entry] of this.entries())
      yield entry
  }

  async getFileHandle (name: string, options: FileSystemGetFileOptions = {}) {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) throw new TypeError(`Name contains invalid characters.`)
    options.create = !!options.create
    return new FileSystemFileHandle(await this[kAdapter].getFileHandle(name, options))
  }

  /** @deprecated */
  getFile (name: string, options: FileSystemGetFileOptions = {}) {
    return this.getFileHandle(name, options)
  }

  async removeEntry (name: string, options: FileSystemRemoveOptions = {}) {
    if (name === '') throw new TypeError(`Name can't be an empty string.`)
    if (name === '.' || name === '..' || name.includes('/')) throw new TypeError(`Name contains invalid characters.`)
    options.recursive = !!options.recursive // cuz node's fs.rm require boolean
    return this[kAdapter].removeEntry(name, options)
  }

  async resolve (possibleDescendant: globalThis.FileSystemHandle) {
    if (await possibleDescendant.isSameEntry(this)) {
      return []
    }

    const openSet: { handle: FileSystemDirectoryHandle; path: string[]; }[] = [{ handle: this, path: [] }]

    while (openSet.length) {
      let { handle: current, path } = openSet.pop()!

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
