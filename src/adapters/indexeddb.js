import { errors } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX } = errors

class Sink {
  constructor (db, id, size, file) {
    this.db = db
    this.id = id
    this.size = size
    this.position = 0
    this.file = file
  }
  write (chunk) {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          if (this.size < chunk.position) {
            throw new DOMException(...INVALID)
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
            ? file.slice(0, chunk.size)
            : new File([file, new Uint8Array(chunk.size - this.size)], file.name)

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
    return new Promise((rs,rj) => {
      const [tx, table] = store(this.db)
      table.get(this.id).onsuccess = (evt) => {
        evt.target.result
          ? table.put(this.file, this.id)
          : rj(new DOMException(...GONE))
      }
      tx.oncomplete = () => rs()
    })
  }
}

class FileHandle {
  constructor (db, id, name) {
    this.db = db
    this.id = id
    this.name = name
    this.kind = 'file'
    this.readable = true
    this.writable = true
  }
  async getFile () {
    const [tx, table] = store(this.db)
    const file = await new Promise(rs => table.get(this.id).onsuccess = evt => rs(evt.target.result))
    if (!file) throw new DOMException(...GONE)
    return file
  }
  async createWritable (opts) {
    const file = await this.getFile()
    return new Sink(this.db, this.id, file.size, file)
  }
}

function store (db) {
  const tx = db.transaction('entries', 'readwrite', { durability: 'relaxed' })
  return [tx, tx.objectStore('entries')]
}

function rimraf(evt, toDelete, recursive = true) {
  let { source, result } = evt.target
  for (const [id, isFile] of Object.values(toDelete || result)) {
    if (isFile) source.delete(id)
    else if (recursive) {
      source.get(id).onsuccess = rimraf
      source.delete(id)
    } else {
      source.get(id).onsuccess = (evt) => {
        if (Object.keys(evt.target.result).length !== 0) {
          evt.target.transaction.abort()
        } else {
          source.delete(id)
        }
      }
    }
  }
}

class FolderHandle {
  constructor(db, id, name) {
    this.db = db
    this.id = id
    this.kind = 'directory'
    this.name = name
    this.readable = true
    this.writable = true
  }
  async * getEntries () {
    const [tx, table] = store(this.db)
    const entries = await new Promise(rs => table.get(this.id).onsuccess = evt => rs(evt.target.result))
    if (!entries) throw new DOMException(...GONE)
    for (let [name, [id, isFile]] of Object.entries(entries)) {
      yield isFile
        ? new FileHandle(this.db, id, name)
        : new FolderHandle(this.db, id, name)
    }
  }
  getDirectoryHandle (name, opts = {}) {
    return new Promise((rs, rj) => {
      const [ tx, table ] = store(this.db)
      table.get(this.id).onsuccess = evt => {
        const entries = evt.target.result
        const entry = entries[name]
        entry // entry exist
          ? entry[1] // isFile?
            ? rj(new DOMException(...MISMATCH))
            : rs(new FolderHandle(this.db, entry[0], name))
          : opts.create
            ? table.add({}).onsuccess = evt => {
              const id = evt.target.result
              entries[name] = [id, false]
              table.put(entries, this.id)
                .onsuccess = () => rs(new FolderHandle(this.db, id, name))
            }
            : rj(new DOMException(...GONE))
      }
    })
  }
  getFileHandle (name, opts = {}) {
    return new Promise((rs, rj) => {
      const [tx, table] = store(this.db)
      const query = table.get(this.id)
      query.onsuccess = evt => {
        const entries = evt.target.result
        const entry = entries[name]
        if (entry && entry[1]) rs(new FileHandle(this.db, entry[0], name))
        if (entry && !entry[1]) rj(new DOMException(...MISMATCH))
        if (!entry && !opts.create) rj(new DOMException(...GONE))
        if (!entry && opts.create) {
          const query = table.put(new File([], name))
          query.onsuccess = (evt) => {
            const id = evt.target.result
            entries[name] = [id, true]
            const query = table.put(entries, this.id)
            query.onsuccess = () => {
              rs(new FileHandle(this.db, id, name))
            }
          }
        }
      }
    })
  }
  async removeEntry (name, opts) {
    return new Promise((rs, rj) => {
      const [tx, table] = store(this.db)
      const cwdQ = table.get(this.id)
      cwdQ.onsuccess = (evt) => {
        const cwd = cwdQ.result
        const toDelete = {_:cwd[name]}
        if (!toDelete._) {
          return rj(new DOMException(...GONE))
        }
        delete cwd[name]
        table.put(cwd, this.id)
        rimraf(evt, toDelete, !!opts.recursive)
      }
      tx.oncomplete = rs
      tx.onerror = rj
      tx.onabort = () => {
        rj(new DOMException(...MOD_ERR))
      }
    })
  }
}

export default (opts = { persistent: false }) => new Promise((rs,rj) => {
  const request = indexedDB.open('fileSystem')

  request.onupgradeneeded = evt => {
    const db = evt.target.result
    db.createObjectStore('entries', { autoIncrement: true }).transaction.oncomplete = evt => {
      db.transaction('entries', 'readwrite').objectStore('entries').add({})
    }
  }

  request.onsuccess = evt => {
    rs(new FolderHandle(evt.target.result, 1, ''))
  }
})
