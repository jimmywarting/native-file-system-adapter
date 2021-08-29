import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js'
import { Adapter, AdapterModule } from './interfaces.js'

export function getOriginPrivateDirectory (): Promise<globalThis.FileSystemDirectoryHandle>
export function getOriginPrivateDirectory (adapter: Adapter<void> | AdapterModule<void> | Promise<Adapter<void> | AdapterModule<void>>): Promise<globalThis.FileSystemDirectoryHandle>
export function getOriginPrivateDirectory <T>(adapter: Adapter<T> | AdapterModule<T> | Promise<Adapter<T> | AdapterModule<T>>, options: T): Promise<globalThis.FileSystemDirectoryHandle>
export async function getOriginPrivateDirectory <T>(adapter?: Adapter<T> | AdapterModule<T> | Promise<Adapter<T> | AdapterModule<T>>, options: T = {} as T) {
  if (!adapter) {
    if (!globalThis.navigator?.storage && globalThis.location?.protocol === 'http:') {
      throw new Error(`Native getDirectory not supported in HTTP context. Please use HTTPS instead or provide an adapter.`)
    }
    if (!globalThis.navigator?.storage?.getDirectory) {
      throw new Error(`Native StorageManager.getDirectory() is not supported in current environment. Please provide an adapter instead.`)
    }
    return globalThis.navigator.storage.getDirectory()
  }
  const module = await adapter
  const sandbox = typeof module === 'function' ? await module(options as T) : await module.default(options as T)
  return new FileSystemDirectoryHandle(sandbox)
}

export default getOriginPrivateDirectory
