import { FileSystemFileHandle } from './FileSystemFileHandle.js'
import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js'

/**
 * Reconstruct a `FileSystemFileHandle` or `FileSystemDirectoryHandle` from a
 * plain object that was previously produced by `handle.serialize()`.
 *
 * The `adapterModule` argument must be the same adapter module that was used
 * when the handle was originally created.  The module must export a
 * `deserialize(data, ...args)` function; adapters that do not support
 * deserialization will cause this function to throw.
 *
 * Extra arguments beyond `data` and `adapterModule` are forwarded to the
 * adapter's own `deserialize` implementation.  For example, the memory adapter
 * requires the root `FolderHandle` as a third argument so it can navigate the
 * in-memory tree.
 *
 * @example <caption>Node adapter</caption>
 * import { deserialize } from 'native-file-system-adapter'
 * import * as nodeAdapter from 'native-file-system-adapter/src/adapters/node.js'
 *
 * const handle = await deserialize(serializedData, nodeAdapter)
 *
 * @example <caption>Memory adapter (within-session)</caption>
 * import { deserialize } from 'native-file-system-adapter'
 * import * as memoryAdapter from 'native-file-system-adapter/src/adapters/memory.js'
 *
 * // `root` is the raw FolderHandle from which the tree was built.
 * const handle = await deserialize(serializedData, memoryAdapter, rawRootFolderHandle)
 *
 * @param {{ kind: 'file'|'directory', name: string, [key: string]: any }} data
 *   Serialized handle data produced by `handle.serialize()`.
 * @param {object} adapterModule
 *   The imported adapter module (not a Promise — await it first if needed).
 * @param {...any} args
 *   Additional arguments forwarded to the adapter's `deserialize` function.
 * @returns {Promise<FileSystemFileHandle|FileSystemDirectoryHandle>}
 */
export async function deserialize (data, adapterModule, ...args) {
  const mod = await adapterModule
  if (typeof mod.deserialize !== 'function') {
    throw new TypeError(
      'The provided adapter module does not export a `deserialize` function ' +
      'and therefore does not support handle deserialization.'
    )
  }
  const adapterHandle = await mod.deserialize(data, ...args)
  return data.kind === 'file'
    ? new FileSystemFileHandle(adapterHandle)
    : new FileSystemDirectoryHandle(adapterHandle)
}
