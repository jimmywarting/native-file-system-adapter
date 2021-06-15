const wm = new WeakMap()

class FileSystemHandle {
  /** @type {FileSystemHandle} */
  #adapter

  /** @type {string} */
  name
  /** @type {('file'|'directory')} */
  kind

  /** @param {FileSystemHandle & {writable}} adapter */
  constructor (adapter) {
    this.kind = adapter.kind
    this.name = adapter.name
    this.#adapter = adapter
  }

  async queryPermission (options = {}) {
    if (options.readable) return 'granted'
    const handle = this.#adapter
    return handle.queryPermission ?
      await handle.queryPermission(options) :
      handle.writable
        ? 'granted'
        : 'denied'
  }

  async requestPermission (options = {}) {
    if (options.readable) return 'granted'
    const handle = this.#adapter
    return handle.writable ? 'granted' : 'denied'
  }

  /**
   * Attempts to remove the entry represented by handle from the underlying file system.
   *
   * @param {object} options
   * @param {boolean} [options.recursive=false]
   */
  async remove (options = {}) {
    await this.#adapter.remove(options)
  }

  /**
   * @param {FileSystemHandle} other
   */
  async isSameEntry (other) {
    if (this === other) return true
    if (this.kind !== other.kind) return false
    return this.#adapter.isSameEntry(other.#adapter)
  }
}

Object.defineProperty(FileSystemHandle.prototype, Symbol.toStringTag, {
  value: 'FileSystemHandle',
  writable: false,
  enumerable: false,
  configurable: true
})

export default FileSystemHandle
export { FileSystemHandle }
