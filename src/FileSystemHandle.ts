import { FileSystemHandleAdapter } from './interfaces'

const kAdapter = Symbol('adapter')

export class FileSystemHandle {
  /** @internal */
  [kAdapter]: FileSystemHandleAdapter

  readonly kind: 'file' | 'directory'
  readonly name: string

  /** @deprecated */
  get isFile(): any {
    return this.kind === 'file'
  }

  /** @deprecated */
  get isDirectory(): any {
    return this.kind === 'directory'
  }

  constructor (adapter: FileSystemHandleAdapter) {
    this.kind = adapter.kind
    this.name = adapter.name
    this[kAdapter] = adapter
  }

  async queryPermission (options: FileSystemHandlePermissionDescriptor = {}) {
    const handle = this[kAdapter]
    if (handle.queryPermission) {
      return handle.queryPermission(options)
    }

    if (options.mode === 'read') {
      return 'granted'
    } else if (options.mode === 'readwrite') {
      return handle.writable ? 'granted' : 'denied'
    } else {
      throw new TypeError(`Mode ${options.mode} must be 'read' or 'readwrite'`)
    }
  }

  async requestPermission (options: FileSystemHandlePermissionDescriptor = {}) {
    const handle = this[kAdapter]
    if (handle.requestPermission) {
      return handle.requestPermission(options)
    }

    if (options.mode === 'read') {
      return 'granted'
    } else if (options.mode === 'readwrite') {
      return handle.writable ? 'granted' : 'denied'
    } else {
      throw new TypeError(`Mode ${options.mode} must be 'read' or 'readwrite'`)
    }
  }

  async isSameEntry (other: FileSystemHandle | globalThis.FileSystemHandle) {
    if (this === other) return true
    if (this.kind !== other.kind) return false
    if (!(other as FileSystemHandle)[kAdapter]) return false
    return await this[kAdapter].isSameEntry((other as FileSystemHandle)[kAdapter])
  }
}

Object.defineProperty(FileSystemHandle.prototype, Symbol.toStringTag, {
  value: 'FileSystemHandle',
  writable: false,
  enumerable: false,
  configurable: true
})

export default FileSystemHandle
