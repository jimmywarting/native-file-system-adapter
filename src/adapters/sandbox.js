import { errors } from '../util.js'

const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, SECURITY, DISALLOWED } = errors

class Sink {
  constructor(writer, someklass) {
    this.writer = writer
    this.someklass = someklass
  }
  write (chunk) {
    if (typeof chunk === 'object') {
      if (chunk.type === 'write') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          this.writer.seek(chunk.position)
          if (this.writer.position !== chunk.position) {
            throw new DOMException(`seeking position failed`, 'InvalidStateError')
          }
        }
        if (!('data' in chunk)) {
          throw new DOMException(`Failed to execute 'write' on 'UnderlyingSinkBase': Invalid params passed. write requires a data argument`, 'SyntaxError')
        }
        chunk = chunk.data
      } else if (chunk.type === 'seek') {
        if (Number.isInteger(chunk.position) && chunk.position >= 0) {
          this.writer.seek(chunk.position)
          if (this.writer.position !== chunk.position) {
            throw new DOMException(`seeking position failed`, 'InvalidStateError')
          }
          return
        } else {
          throw new DOMException(`Failed to execute 'write' on 'UnderlyingSinkBase': Invalid params passed. seek requires a position argument`, 'SyntaxError')
        }
      } else if (chunk.type === 'truncate') {
        return new Promise(rs => {
          if (Number.isInteger(chunk.size) && chunk.size >= 0) {
            this.writer.onwriteend = evt => rs()
            this.writer.truncate(chunk.size)
          } else {
            throw new DOMException(`Failed to execute 'write' on 'UnderlyingSinkBase': Invalid params passed. truncate requires a size argument`, 'SyntaxError')
          }
        })
      }
    }
    return new Promise((rs, rj) => {
      // TODO: handle error
      this.writer.onwriteend = evt => rs()
      this.writer.write(new Blob([chunk]))
    })
  }
  close () {
    return new Promise((rs, rj) => {
      this.someklass.file(rs, rj)
    })
  }
}

export class FileHandle {
  constructor (file, writable = true) {
    this.file = file
    this.isFile = true
    this.writable = writable
    this.readable = true
  }
  get name () {
    return this.file.name
  }
  getFile () {
    return new Promise((rs, rj) => this.file.file(rs, rj))
  }
  createWritable (opts) {
    if (!this.writable) throw new DOMException(...DISALLOWED)

    return new Promise((rs, rj) =>
      this.file.createWriter(e => {
        if (opts.keepExistingData === false) {
          e.onwriteend = evt => rs(new Sink(e, this.file))
          e.truncate(0)
        } else {
          rs(new Sink(e, this.file))
        }
      }, rj)
    )
  }
}

export class FolderHandle {
  constructor (dir, writable = true) {
    this.dir = dir
    this.writable = writable
    this.readable = true
  }
  get isFile () {
    return false
  }
  get name () {
    return this.dir.name
  }
  async * getEntries () {
    const entries = await new Promise((rs, rj) => this.dir.createReader().readEntries(rs, rj))
    for (let x of entries) {
      yield x.isFile ? new FileHandle(x, this.writable) : new FolderHandle(x, this.writable)
    }
  }
  getDirectory (name, opts = {}) {
    return new Promise((rs, rj) => {
      this.dir.getDirectory(name, opts, dir => {
        rs(new FolderHandle(dir))
      }, rj)
    })
  }
  getFile (name, opts = {}) {
    return new Promise((rs, rj) => this.dir.getFile(name, opts, file => rs(new FileHandle(file)), rj))
  }
  removeEntry (name, opts) {
    return new Promise(async (rs, rj) => {
      const entry = await this.getDirectory(name).catch(err =>
        err.name === 'TypeMismatchError' ? this.getFile(name) : err
      )

      if (entry.isFile === false) {
        opts.recursive
          ? entry.dir.removeRecursively(rs, rj)
          : entry.dir.remove(rs, rj)
      } else if (entry.isFile) {
        entry.file.remove(rs, rj)
      } else {
        rj(entry)
      }
    })
  }
}

export default (opts = {}) => new Promise((rs,rj) =>
  globalThis.webkitRequestFileSystem(
    !!opts._persistent, 0,
    e => rs(new FolderHandle(e.root), console.log(opts)),
    rj
  )
)

// Used for creating a new FileList in a round-about way
function FileListItem(files) {
  for (var b = new ClipboardEvent("").clipboardData || new DataTransfer; c--;) b.items.add(a[c])
  return b.files
}
