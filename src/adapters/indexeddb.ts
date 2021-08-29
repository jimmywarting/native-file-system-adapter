/* global indexedDB, Blob, File, DOMException */

import { Adapter, FileSystemFileHandleAdapter, FileSystemFolderHandleAdapter, WriteChunk } from '../interfaces.js'
import { errors, isChunkObject } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX } = errors

class Sink implements UnderlyingSink<WriteChunk> {
  private db: IDBDatabase
  private id: IDBValidKey
  private size: number
  private file: File
  private position = 0

  constructor (db: IDBDatabase, id: IDBValidKey, size: number, file: File) {
    this.db = db
    this.id = id
    this.size = size
    this.file = file
  }

  async write (chunk: WriteChunk) {
    // Ensure file still exists before writing
    await new Promise<void>((resolve, reject) => {
      const [tx, table] = store(this.db)
      table.get(this.id).onsuccess = (evt) => {
        (evt.target as IDBRequest).result
          ? table.get(this.id)
          : reject(new DOMException(...GONE))
      }
      tx.oncomplete = () => resolve()
      tx.onabort = reject
      tx.onerror = reject
    })

    if (isChunkObject(chunk)) {
      if (chunk.type === 'write') {
        if (typeof chunk.position === 'number' && chunk.position >= 0) {
          if (this.size < chunk.position) {
            this.file = new File(
              [this.file, new ArrayBuffer(chunk.position - this.size)],
              this.file.name,
              this.file
            )
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
          file = chunk.size < this.size
            ? new File([file.slice(0, chunk.size)], file.name, file)
            : new File([file, new Uint8Array(chunk.size - this.size)], file.name, file)

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

  close () {
    return new Promise<void>((resolve, reject) => {
      const [tx, table] = store(this.db)
      table.get(this.id).onsuccess = (evt) => {
        (evt.target as IDBRequest).result
          ? table.put(this.file, this.id)
          : reject(new DOMException(...GONE))
      }
      tx.oncomplete = () => resolve()
      tx.onabort = reject
      tx.onerror = reject
    })
  }
}

class FileHandle implements FileSystemFileHandleAdapter {
  readonly kind = 'file'
  readonly name: string
  private _db: IDBDatabase
  private _id: IDBValidKey
  writable = true
  readable = true

  constructor (db: IDBDatabase, id: IDBValidKey, name: string) {
    this._db = db
    this._id = id
    this.name = name
  }

  async isSameEntry (other: FileHandle) {
    return this._id === other._id
  }

  async getFile () {
    const file = await new Promise<File>((resolve, reject) => {
      const req = store(this._db)[1].get(this._id)
      req.onsuccess = evt => resolve((evt.target as IDBRequest).result)
      req.onerror = evt => reject((evt.target as IDBRequest).error)
    })
    if (!file) throw new DOMException(...GONE)
    return file
  }

  async createWritable (opts: FileSystemCreateWritableOptions) {
    let file = await this.getFile()
    if (!opts.keepExistingData) {
      file = new File([], file.name, file)
    }
    return new Sink(this._db, this._id, file.size, file)
  }
}

function store (db: IDBDatabase): [IDBTransaction, IDBObjectStore] {
  // @ts-ignore
  const tx = db.transaction('entries', 'readwrite', { durability: 'relaxed' })
  return [tx, tx.objectStore('entries')]
}

function rimraf (
  store: IDBObjectStore,
  result: Record<string, [id: IDBValidKey, isFile: boolean]>,
  toDelete?: Record<string, [id: IDBValidKey, isFile: boolean]>,
  recursive = true
) {
  for (const [id, isFile] of Object.values(toDelete || result)) {
    if (isFile) store.delete(id)
    else if (recursive) {
      store.get(id).onsuccess = (evt) => rimraf(store, (evt.target as IDBRequest).result)
      store.delete(id)
    } else {
      store.get(id).onsuccess = (evt) => {
        if (Object.keys((evt.target as IDBRequest).result).length !== 0) {
          (evt.target as IDBRequest).transaction!.abort()
        } else {
          store.delete(id)
        }
      }
    }
  }
}

type Entries = Record<string, [id: string, isFile: boolean]>

class FolderHandle implements FileSystemFolderHandleAdapter {
  readonly kind = 'directory'
  readonly name: string
  private _db: IDBDatabase
  private _id: IDBValidKey
  writable = true
  readable = true

  constructor (db: IDBDatabase, id: IDBValidKey, name: string) {
    this._db = db
    this._id = id
    this.name = name
  }

  async * entries () {
    const entries = await new Promise<Entries>((resolve, reject) => {
      const getReq = store(this._db)[1].get(this._id)
      getReq.onsuccess = evt => resolve((evt.target as IDBRequest).result)
      getReq.onerror = evt => reject((evt.target as IDBRequest).error)
    })
    if (!entries) throw new DOMException(...GONE)
    for (const [name, [id, isFile]] of Object.entries(entries)) {
      yield [name, isFile
        ? new FileHandle(this._db, id, name)
        : new FolderHandle(this._db, id, name)
      ] as [string, FileHandle | FolderHandle]
    }
  }

  async isSameEntry (other: FolderHandle) {
    return this._id === other._id
  }

  getDirectoryHandle (name: string, opts: FileSystemGetDirectoryOptions = {}) {
    return new Promise<FolderHandle>((resolve, reject) => {
      const table = store(this._db)[1]
      const req = table.get(this._id)
      req.onsuccess = () => {
        const entries = req.result
        const entry = entries[name]
        if (entry) {
          entry[1] // isFile?
            ? reject(new DOMException(...MISMATCH))
            : resolve(new FolderHandle(this._db, entry[0], name))
        } else {
          if (opts.create) {
            const addReq = table.add({})
            addReq.onsuccess = evt => {
              const id = (evt.target as IDBRequest).result
              entries[name] = [id, false]
              const putReq = table.put(entries, this._id)
              putReq.onsuccess = () => resolve(new FolderHandle(this._db, id, name))
              putReq.onerror = evt => reject((evt.target as IDBRequest).error)
            }
            addReq.onerror = evt => reject((evt.target as IDBRequest).error)
          } else {
            reject(new DOMException(...GONE))
          }
        }
      }
      req.onerror = evt => {
        reject((evt.target as IDBRequest).error)
      }
    })
  }

  getFileHandle (name: string, opts: FileSystemGetFileOptions = {}) {
    return new Promise<FileHandle>((resolve, reject) => {
      const table = store(this._db)[1]
      const query = table.get(this._id)
      query.onsuccess = () => {
        const entries = query.result
        const entry = entries[name]
        if (entry && entry[1]) resolve(new FileHandle(this._db, entry[0], name))
        if (entry && !entry[1]) reject(new DOMException(...MISMATCH))
        if (!entry && !opts.create) reject(new DOMException(...GONE))
        if (!entry && opts.create) {
          const q = table.put(new File([], name))
          q.onsuccess = () => {
            const id = q.result
            entries[name] = [id, true]
            const query = table.put(entries, this._id)
            query.onsuccess = () => {
              resolve(new FileHandle(this._db, id, name))
            }
            query.onerror = evt => reject((evt.target as IDBRequest).error)
          }
          q.onerror = evt => reject((evt.target as IDBRequest).error)
        }
      }
      query.onerror = evt => reject((evt.target as IDBRequest).error)
    })
  }

  async removeEntry (name: string, opts: FileSystemRemoveOptions) {
    return new Promise<void>((resolve, reject) => {
      const [tx, table] = store(this._db)
      const cwdQ = table.get(this._id)
      cwdQ.onsuccess = (evt) => {
        const cwd = cwdQ.result
        const toDelete = { _: cwd[name] }
        if (!toDelete._) {
          return reject(new DOMException(...GONE))
        }
        delete cwd[name]
        table.put(cwd, this._id)
        rimraf((evt.target as IDBRequest).source as IDBObjectStore, (evt.target as IDBRequest).result, toDelete, !!opts.recursive)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = reject
      tx.onabort = () => {
        reject(new DOMException(...MOD_ERR))
      }
    })
  }
}

const adapter: Adapter<void> = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('fileSystem')

  request.onupgradeneeded = () => {
    const db = request.result
    db.createObjectStore('entries', { autoIncrement: true }).transaction.oncomplete = evt => {
      db.transaction('entries', 'readwrite').objectStore('entries').add({})
    }
  }

  request.onsuccess = () => {
    resolve(new FolderHandle(request.result, 1, ''))
  }

  request.onerror = (ev) => {
    reject((ev.target as IDBOpenDBRequest).error)
  }
})

export default adapter
