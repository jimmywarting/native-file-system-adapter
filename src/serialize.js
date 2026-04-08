import { FileSystemFileHandle } from './FileSystemFileHandle.js'
import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js'
export { serialize } from './FileSystemHandle.js'

/**
 * Reconstruct a `FileSystemFileHandle` or `FileSystemDirectoryHandle` from a
 * plain object that was previously produced by `serialize(handle)`.
 *
 * When the serialized object contains an `adapter` field (as all built-in
 * adapters produce), the adapter module is imported automatically and no
 * second argument is needed.  Passing an explicit `adapterModule` overrides
 * the automatic import (useful in environments where dynamic import by URL
 * is not available, or for testing).
 *
 * @example <caption>Node adapter — automatic (preferred)</caption>
 * import { serialize, deserialize } from 'native-file-system-adapter'
 *
 * const data = serialize(fileHandle)
 * // later:
 * const handle = await deserialize(data)
 *
 * @example <caption>Explicit module override</caption>
 * import { deserialize } from 'native-file-system-adapter'
 * import * as nodeAdapter from 'native-file-system-adapter/src/adapters/node.js'
 *
 * const handle = await deserialize(data, nodeAdapter)
 *
 * @param {{ adapter?: string, kind: 'file'|'directory', name: string, [key: string]: any }} data
 *   Serialized handle data produced by `serialize()`.
 * @param {object|Promise<object>} [adapterModule]
 *   Optional explicit adapter module (or a dynamic `import()` Promise).
 *   When omitted, the module URL is read from `data.adapter`.
 * @returns {Promise<FileSystemFileHandle|FileSystemDirectoryHandle>}
 */
export async function deserialize (data, adapterModule) {
  let mod

  if (adapterModule !== undefined) {
    // Accept both a plain module object and a dynamic import() Promise.
    mod = await adapterModule
  } else if (data && typeof data.adapter === 'string') {
    // Extract module URL from "moduleUrl:ConstructorName" (use lastIndexOf so
    // colons inside file:// or https:// URLs are not accidentally split on).
    const lastColon = data.adapter.lastIndexOf(':')
    const moduleUrl = data.adapter.slice(0, lastColon)
    mod = await import(moduleUrl)
  }

  if (!mod || typeof mod.deserialize !== 'function') {
    throw new TypeError(
      'Cannot deserialize: no `deserialize` function found. ' +
      'Either the serialized data is missing an `adapter` field or the ' +
      'adapter module does not export `deserialize`.'
    )
  }

  const adapterHandle = await mod.deserialize(data)
  return data.kind === 'file'
    ? new FileSystemFileHandle(adapterHandle)
    : new FileSystemDirectoryHandle(adapterHandle)
}
