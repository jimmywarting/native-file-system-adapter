const wm = new WeakMap()

class FileSystemHandle {
  constructor (meta) {
    /** @type {"file|directory"} */
    this.kind = meta.kind
    /** @type {string} */
    this.name = meta.name
    wm.set(this, meta)
  }

  async queryPermission (options = {}) {
    if (options.readable) return 'granted'
    const handle = wm.get(this)
    return handle.queryPermission ?
      handle.queryPermission(options) :
      handle.writable
        ? 'granted'
        : 'denied'
  }

  async requestPermission (options = {}) {
    if (options.readable) return 'granted'
    const handle = wm.get(this)
    return handle.writable ? 'granted' : 'denied'
  }
}

Object.defineProperty(FileSystemHandle.prototype, Symbol.toStringTag, {
  value: 'FileSystemHandle',
  writable: false,
  enumerable: false,
  configurable: true
})

export default FileSystemHandle
