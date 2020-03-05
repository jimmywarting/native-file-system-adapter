const wm = new WeakMap()

class FileSystemHandle {
  constructor (meta) {
    this.isDirectory = !meta.isFile
    this.isFile = !!meta.isFile
    this.name = meta.name
    wm.set(this, meta)
  }

  async queryPermission (options) {
    return wm.get(this).queryPermission(options)
  }

  async requestPermission (options) {
    return wm.get(this).queryPermission(options)
  }
}

Object.defineProperty(FileSystemHandle.prototype, Symbol.toStringTag, {
  value: 'FileSystemHandle',
  writable: false,
  enumerable: false,
  configurable: true
})

export default FileSystemHandle
