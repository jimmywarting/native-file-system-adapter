const kAdapter = Symbol('adapter')

/**
 * @typedef {Object} FileSystemHandlePermissionDescriptor
 * @property {('read'|'readwrite')} [mode='read']
 */
class FileSystemHandle {
  /** @type {FileSystemHandle} */
  [kAdapter]

  /** @type {string} */
  name
  /** @type {('file'|'directory')} */
  kind

  /** @param {FileSystemHandle & {writable}} adapter */
  constructor (adapter) {
    this.kind = adapter.kind
    this.name = adapter.name
    this[kAdapter] = adapter
  }

  /** @param {FileSystemHandlePermissionDescriptor} descriptor */
  async queryPermission (descriptor = {}) {
    const { mode = 'read' } = descriptor
    const handle = this[kAdapter]

    if (handle.queryPermission) {
      return handle.queryPermission({mode})
    }

    if (mode === 'read') {
      return 'granted'
    } else if (mode === 'readwrite') {
      return handle.writable ? 'granted' : 'denied'
    } else {
      throw new TypeError(`Mode ${mode} must be 'read' or 'readwrite'`)
    }
  }

  async requestPermission ({mode = 'read'} = {}) {
    const handle = this[kAdapter]
    if (handle.requestPermission) {
      return handle.requestPermission({mode})
    }

    if (mode === 'read') {
      return 'granted'
    } else if (mode === 'readwrite') {
      return handle.writable ? 'granted' : 'denied'
    } else {
      throw new TypeError(`Mode ${mode} must be 'read' or 'readwrite'`)
    }
  }

  /**
   * Attempts to remove the entry represented by handle from the underlying file system.
   *
   * @param {object} options
   * @param {boolean} [options.recursive=false]
   */
  async remove (options = {}) {
    await this[kAdapter].remove(options)
  }

  async getUniqueId () {
    const adapter = this[kAdapter]
    if (adapter.getUniqueId) {
      return adapter.getUniqueId()
    }
    // Fallback: generate a random UUID v4 once and cache it on the adapter object.
    if (!adapter._uniqueId) {
      adapter._uniqueId = crypto.randomUUID()
    }
    return adapter._uniqueId
  }

  /**
   * @param {FileSystemHandle} other
   */
  async isSameEntry (other) {
    if (this === other) return true
    if (
      (!other) ||
      (typeof other !== 'object') ||
      (this.kind !== other.kind) ||
      (!other[kAdapter])
    ) return false
    return this[kAdapter].isSameEntry(other[kAdapter])
  }
}

Object.defineProperty(FileSystemHandle.prototype, Symbol.toStringTag, {
  value: 'FileSystemHandle',
  writable: false,
  enumerable: false,
  configurable: true
})

// Safari safari doesn't support writable streams yet.
if (globalThis.FileSystemHandle) {
  globalThis.FileSystemHandle.prototype.queryPermission ??= function (descriptor) {
    return 'granted'
  }
}

/**
 * Serialize a `FileSystemHandle` to a plain, JSON-safe object that can be
 * stored (e.g. in localStorage or IndexedDB) or transferred and later passed
 * to `getOriginPrivateDirectory(serialized)` to reconstruct an equivalent
 * handle.
 *
 * This is an external polymorphic dispatch function rather than a prototype
 * method — it dispatches to the adapter's own `serialize()` implementation.
 * The returned object always includes an `adapter` field of the form
 * `"<module-url>:<ConstructorName>"` that `getOriginPrivateDirectory` uses to
 * identify and import the correct adapter when reconstructing.
 *
 * Adapters that do not implement `serialize()` cause this function to throw a
 * `DOMException` with name `'NotSupportedError'`.
 *
 * @param {FileSystemHandle} handle
 * @returns {{ adapter: string, kind: 'file'|'directory', name: string, [key: string]: any }}
 */
function serialize (handle) {
  // Native (non-polyfill) handles have no polyfill adapter — return as-is.
  if (globalThis.FileSystemHandle && handle instanceof globalThis.FileSystemHandle) {
    return handle
  }
  const adapter = handle[kAdapter]
  if (!adapter || typeof adapter.serialize !== 'function') {
    throw new DOMException(
      'The adapter backing this handle does not support serialization.',
      'NotSupportedError'
    )
  }
  return adapter.serialize()
}

export default FileSystemHandle
export { FileSystemHandle, serialize, kAdapter }
