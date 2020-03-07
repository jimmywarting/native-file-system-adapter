const wm = new WeakMap()

class FileSystemHandle {
  constructor (meta) {
    this.isDirectory = !meta.isFile
    this.isFile = !!meta.isFile
    this.name = meta.name
    wm.set(this, meta)
  }

  async queryPermission (options = {}) {
    if (options.readable) return 'granted'
    const handle = wm.get(this)
    return handle.writable ? 'granted' : 'denied'
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
