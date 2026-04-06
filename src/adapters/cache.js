/* global Blob, DOMException, File, Response, caches, location */

import { errors } from '../util.js'
import { BlobSink } from './blobsink.js'

const { GONE, MISMATCH, MOD_ERR } = errors

/**
 * Returns a stable UUID-format unique ID derived from the entry kind and cache
 * path using SHA-256 via the Web Crypto API.
 *
 * @param {string} kind - 'file' | 'directory'
 * @param {string} path
 * @returns {Promise<string>}
 */
async function pathToUUID (kind, path) {
  const data = new TextEncoder().encode(`${kind}:${path}`)
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const DIR = { headers: { 'content-type': 'dir' } }
const FILE = () => ({ headers: { 'content-type': 'file', 'last-modified': Date.now() } })
const hasOwn = Object.prototype.hasOwnProperty

class Sink extends BlobSink {
  constructor (cache, path, file) {
    super(file)
    this._cache = cache
    this.path = path
  }

  async close () {
    const [r] = await this._cache.keys(this.path)
    if (!r) throw new DOMException(...GONE)
    return this._cache.put(this.path, new Response(this.file, FILE()))
  }

  abort () {
    // Nothing to clean up – the write was never committed to the cache.
  }
}

export class FileHandle {
  /**
   * @param {string} path
   * @param {Cache} cache
   */
  constructor (path, cache) {
    this._cache = cache
    this.path = path
    this.kind = 'file'
    this.writable = true
    this.readable = true
  }

  get name () {
    return this.path.split('/').pop()
  }

  /** @param {FileHandle} other */
  async isSameEntry (other) {
    return this.path === other.path
  }

  getUniqueId () {
    return pathToUUID(this.kind, this.path)
  }

  async getFile () {
    const res = await this._cache.match(this.path)
    if (!res) throw new DOMException(...GONE)
    const blob = await res.blob()
    const file = new File([blob], this.name, { lastModified: +res.headers.get('last-modified') })
    return file
  }

  async createWritable (opts) {
    const [r] = await this._cache.keys(this.path)
    if (!r) throw new DOMException(...GONE)

    return new Sink(
      this._cache,
      this.path,
      opts.keepExistingData
        ? await this.getFile()
        : new File([], this.name
      )
    )
  }

  async remove () {
    const [r] = await this._cache.keys(this.path)
    if (!r) throw new DOMException(...GONE)
    await this._cache.delete(this.path)
  }
}

export class FolderHandle {
  /**
   * @param {string} dir
   * @param {Cache} cache
   */
  constructor (dir, cache) {
    this._dir = dir
    this.writable = true
    this.readable = true
    this._cache = cache
    this.kind = 'directory'
    this.name = dir.split('/').pop()
  }

  /** @returns {AsyncGenerator<[string, FileHandle | FolderHandle]>} */
  async * entries () {
    for (const [path, isFile] of Object.entries(await this._tree)) {
      yield [path.split('/').pop(), isFile ? new FileHandle(path, this._cache) : new FolderHandle(path, this._cache)]
    }
  }

  /** @param {FolderHandle} other  */
  async isSameEntry (other) {
    return this._dir === other._dir
  }

  getUniqueId () {
    return pathToUUID(this.kind, this._dir)
  }

  /**
   * @param {string} name
   * @param {{ create: boolean; }} opts
   */
  async getDirectoryHandle (name, opts) {
    const path = this._dir.endsWith('/') ? this._dir + name : `${this._dir}/${name}`
    const tree = await this._tree
    if (hasOwn.call(tree, path)) {
      const isFile = tree[path]
      if (isFile) throw new DOMException(...MISMATCH)
      return new FolderHandle(path, this._cache)
    } else {
      if (opts.create) {
        tree[path] = false
        await this._cache.put(path, new Response('{}', DIR))
        await this._save(tree)
        return new FolderHandle(path, this._cache)
      }
      throw new DOMException(...GONE)
    }
  }

  get _tree () {
    return this._cache.match(this._dir).then(r => r.json()).catch(e => {
      throw new DOMException(...GONE)
    })
  }

  _save (tree) {
    return this._cache.put(this._dir, new Response(JSON.stringify(tree), DIR))
  }

  /**
   * @param {string} name
   * @param {{ create: boolean; }} opts
   */
  async getFileHandle (name, opts) {
    const path = this._dir.endsWith('/') ? this._dir + name : `${this._dir}/${name}`
    const tree = await this._tree
    if (hasOwn.call(tree, path)) {
      const isFile = tree[path]
      if (!isFile) throw new DOMException(...MISMATCH)
      return new FileHandle(path, this._cache)
    } else {
      if (opts.create) {
        const tree = await this._tree
        tree[path] = true
        await this._cache.put(path, new Response('', FILE()))
        await this._save(tree)
        return new FileHandle(path, this._cache)
      } else {
        throw new DOMException(...GONE)
      }
    }
  }

  /**
   * @param {string} name
   * @param {{ recursive: boolean; }} opts
   */
  async removeEntry (name, opts) {
    const tree = await this._tree
    const path = this._dir.endsWith('/') ? this._dir + name : `${this._dir}/${name}`
    if (hasOwn.call(tree, path)) {
      if (opts.recursive) {
        const toDelete = [...Object.entries(tree)]
        while (toDelete.length) {
          const [path, isFile] = toDelete.pop()
          if (isFile) {
            await this._cache.delete(path)
          } else {
            const e = await this._cache.match(path).then(r => r.json())
            toDelete.push(...Object.entries(e))
          }
        }
        delete tree[path]
      } else {
        const isFile = tree[path]
        delete tree[path]
        if (isFile) {
          await this._cache.delete(path)
        } else {
          const e = await this._cache.match(path).then(r => r.json())
          const keys = Object.keys(e)
          if (keys.length) {
            throw new DOMException(...MOD_ERR)
          } else {
            await this._cache.delete(path)
          }
        }
      }

      await this._save(tree)
    } else {
      throw new DOMException(...GONE)
    }
  }

  async remove (options = {}) {
    const tree = await this._tree
    if (!options.recursive) {
      for (const [path, isFile] of Object.entries(tree)) {
        if (path !== '_' && path !== this._dir) {
          if (isFile) {
            // files at this level are ok
          } else {
            throw new DOMException(...MOD_ERR)
          }
        }
      }
    }
    const toDelete = [...Object.entries(tree)]
    while (toDelete.length) {
      const [path, isFile] = toDelete.pop()
      if (path === '_' || path === this._dir) continue
      if (isFile) {
        await this._cache.delete(path)
      } else {
        try {
          const e = await this._cache.match(path).then(r => r.json())
          toDelete.push(...Object.entries(e))
        } catch (_) { /* ignore */ }
      }
    }
    await this._cache.delete(this._dir)
  }
}

export default async function () {
  const cache = await caches.open('sandboxed-fs')
  if (!await cache.match('/')) await cache.put('/', new Response('{}', DIR))
  return new FolderHandle(location.origin + '/', cache)
}
