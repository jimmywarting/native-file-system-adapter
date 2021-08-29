export const support = {
  adapter: {
    cache: !!(globalThis.CacheStorage && globalThis.caches instanceof CacheStorage),
    native: typeof globalThis.navigator?.storage?.getDirectory === 'function',
    sandbox: typeof window !== 'undefined' && typeof window.webkitRequestFileSystem === 'function'
  }
}
