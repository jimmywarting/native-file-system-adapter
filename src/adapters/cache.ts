import { Adapter, FileSystemFileHandleAdapter, FileSystemFolderHandleAdapter, WriteChunk } from '../interfaces.js'
import { errors, isChunkObject } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX } = errors

const DIR = { headers: { 'content-type': 'dir' } }
const FILE = () => ({ headers: { 'content-type': 'file', 'last-modified': '' + Date.now() } })

class Sink implements UnderlyingSink<WriteChunk> {
  private _cache: Cache
  private path: string
  private size: number
  private position: number
  private file: File

  constructor (cache: Cache, path: string, file: File) {
    this._cache = cache
    this.path = path
    this.size = file.size
    this.position = 0
    this.file = file
  }

  async write (chunk: WriteChunk) {
    const [r] = await this._cache.keys(this.path)
    if (!r) throw new DOMException(...GONE)

    if (isChunkObject(chunk)) {
      if (chunk.type === 'write') {
        if (typeof chunk.position === 'number' && chunk.position >= 0) {
          if (this.size < chunk.position) {
            const blob = new Blob([this.file, new ArrayBuffer(chunk.position - this.size)])
            this.file = new File([blob], this.file.name, this.file)
          }
          this.position = chunk.position
        }
        if (!('data' in chunk)) {
          throw new DOMException(...SYNTAX('write requires a data argument'))
        }
        chunk = chunk.data
      } else if (chunk.type === 'seek') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          if (this.size < chunk.position) {
            throw new DOMException(...INVALID)
          }
          this.position = chunk.position
          return
        } else {
          throw new DOMException(...SYNTAX('seek requires a position argument'))
        }
      } else if (chunk.type === 'truncate') {
        if (Number.isInteger(chunk.size) && chunk.size >= 0) {
          let file = this.file
          file = new File(
            chunk.size < this.size ? [file.slice(0, chunk.size)] : [file, new Uint8Array(chunk.size - this.size)],
            file.name,
            file
          )

          this.size = file.size
          if (this.position > file.size) {
            this.position = file.size
          }
          this.file = file
          return
        } else {
          throw new DOMException(...SYNTAX('truncate requires a size argument'))
        }
      }
    }

    chunk = new Blob([chunk])

    let blob = this.file
    // Calc the head and tail fragments
    const head = blob.slice(0, this.position)
    const tail = blob.slice(this.position + chunk.size)

    // Calc the padding
    let padding = this.position - head.size
    if (padding < 0) {
      padding = 0
    }
    blob = new File([
      head,
      new Uint8Array(padding),
      chunk,
      tail
    ], blob.name)
    this.size = blob.size
    this.position += chunk.size
    this.file = blob
  }

  async close () {
    const [r] = await this._cache.keys(this.path)
    if (!r) throw new DOMException(...GONE)
    return this._cache.put(this.path, new Response(this.file, FILE()))
  }
}

export class FileHandle implements FileSystemFileHandleAdapter {
  readonly kind = 'file'
  private _cache: Cache
  private path: string
  writable = true
  readable = true

  constructor (path: string, cache: Cache) {
    this._cache = cache
    this.path = path
  }

  get name () {
    return this.path.split('/').pop()!
  }

  async isSameEntry (other: FileHandle) {
    return this.path === other.path
  }

  async getFile () {
    const res = await this._cache.match(this.path)
    if (!res) throw new DOMException(...GONE)
    const blob = await res.blob()
    const file = new File([blob], this.name, { lastModified: + res.headers.get('last-modified')! })
    return file
  }

  async createWritable (opts: FileSystemCreateWritableOptions) {
    let file = await this.getFile()
    if (!opts.keepExistingData) {
      file = new File([], file.name, file)
    }
    return new Sink(this._cache, this.path, file)
    // let p, rs
    // p = new Promise(resolve => rs = resolve)
    // const { readable, writable } = new TransformStream(new Sink(p))
    // this._cache.put(this.path, new Response(readable, FILE())).then(rs)
    // return writable.getWriter()
  }
}

export class FolderHandle implements FileSystemFolderHandleAdapter {
  readonly kind = 'directory'
  readonly name: string
  private _dir: string
  private _cache: Cache
  writable = true
  readable = true

  constructor (dir: string, cache: Cache) {
    this._dir = dir
    this._cache = cache
    this.name = dir.split('/').pop()!
  }

  async * entries () {
    for (const [path, isFile] of Object.entries(await this._tree)) {
      yield [
        path.split('/').pop()!,
        isFile ? new FileHandle(path, this._cache) : new FolderHandle(path, this._cache)
      ] as [string, FileHandle | FolderHandle]
    }
  }

  async isSameEntry (other: FolderHandle) {
    return this._dir === other._dir
  }

  async getDirectoryHandle (name: string, opts: FileSystemGetDirectoryOptions = {}) {
    const path = this._dir.endsWith('/') ? this._dir + name : `${this._dir}/${name}`
    const tree = await this._tree
    if (tree.hasOwnProperty(path)) {
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
    return this._cache.match(this._dir).then<Record<string, boolean>>(r => r!.json()).catch(e => {
      throw new DOMException(...GONE)
    })
  }

  _save (tree: Record<string, boolean>) {
    return this._cache.put(this._dir, new Response(JSON.stringify(tree), DIR))
  }

  async getFileHandle (name: string, opts: FileSystemGetFileOptions = {}) {
    const path = this._dir.endsWith('/') ? this._dir + name : `${this._dir}/${name}`
    const tree = await this._tree
    if (tree.hasOwnProperty(path)) {
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

  async removeEntry (name: string, opts: FileSystemRemoveOptions) {
    const tree = await this._tree
    const path = this._dir.endsWith('/') ? this._dir + name : `${this._dir}/${name}`
    if (tree.hasOwnProperty(path)) {
      if (opts.recursive) {
        const toDelete = [...Object.entries(tree)]
        while (toDelete.length) {
          const [path, isFile] = toDelete.pop()!
          if (isFile) {
            await this._cache.delete(path)
          } else {
            const e = await this._cache.match(path).then<Record<string, boolean>>(r => r!.json())
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
          const e = await this._cache.match(path).then(r => r!.json())
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
}

const adapter: Adapter<void> = async () => {
  const cache = await caches.open('sandboxed-fs')
  if (!await cache.match('/')) await cache.put('/', new Response('{}', DIR))
  return new FolderHandle(location.origin + '/', cache)
}

export default adapter
