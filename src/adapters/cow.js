/**
 * Copy-on-write overlay adapter with .fslink shortcut support.
 *
 * Wraps any read-only (or read-write) base adapter with a writable in-memory
 * overlay. Reads fall through to the base unless the overlay has a newer copy.
 * All writes land in the overlay — the base is never mutated. Deletions are
 * recorded as tombstone entries in the overlay.
 *
 * Additionally, any entry whose name ends in `.fslink` is transparently
 * resolved: its content is read as a JSON-serialized handle (produced by
 * `serialize()`), deserialized via `getOriginPrivateDirectory()`, and exposed
 * to callers under the stem name (without the `.fslink` suffix). This lets
 * you "mount" arbitrary adapter handles into a CoW tree without touching any
 * core polyfill code.
 *
 * Usage:
 *   import { wrapWithCow, createFsLink } from './adapters/cow.js'
 *   import getOriginPrivateDirectory from './getOriginPrivateDirectory.js'
 *
 *   // Wrap a drag-dropped (read-only) directory so it appears writable:
 *   const base = await item.getAsFileSystemHandle()  // read-only sandbox handle
 *   const cow = wrapWithCow(base)
 *
 *   // Now you can write without touching the original:
 *   const f = await cow.getFileHandle('notes.txt', { create: true })
 *   const w = await f.createWritable()
 *   await w.write('hello')
 *   await w.close()
 *
 *   // Create a .fslink shortcut pointing to an IDB-backed directory:
 *   const idbRoot = await getOriginPrivateDirectory(import('./indexeddb.js'))
 *   await createFsLink(idbRoot, cow, 'my-idb-mount')
 *
 *   // Iterate — 'my-idb-mount' appears as a normal directory entry:
 *   for await (const [name, handle] of cow) {
 *     console.log(name, handle.kind)  // 'my-idb-mount', 'directory'
 *   }
 */

import { FolderHandle as MemFolderHandle, FileHandle as MemFileHandle } from './memory.js'
import { errors } from '../util.js'
import { kAdapter } from '../FileSystemHandle.js'

const { GONE, MISMATCH } = errors

/**
 * Sentinel stored in the overlay to record entries deleted from the CoW view
 * that still physically exist in the base adapter.
 * @type {symbol}
 */
const TOMBSTONE = Symbol('cow:deleted')

// ---------------------------------------------------------------------------
// .fslink resolution helper
// ---------------------------------------------------------------------------

/**
 * Resolve a `.fslink` file handle to the raw inner adapter handle it points to.
 *
 * The `.fslink` file contains a JSON-serialised handle produced by
 * `serialize()`.  We parse that, call `getOriginPrivateDirectory()` to obtain
 * a public `FileSystemHandle`, then extract its inner adapter via `kAdapter`.
 *
 * Returns the inner adapter handle on success, or `null` if resolution fails
 * for any reason (broken link, malformed JSON, missing adapter module, …).
 *
 * @param {MemFileHandle|object} fileHandle  - adapter FileHandle whose content
 *   is a JSON-serialised target handle
 * @returns {Promise<object|null>}  raw adapter handle (FolderHandle or FileHandle)
 */
async function resolveFsLink (fileHandle) {
  try {
    const file = await fileHandle.getFile()
    const text = await file.text()
    const parsed = JSON.parse(text)
    const { default: getOriginPrivateDirectory } = await import('../getOriginPrivateDirectory.js')
    const publicHandle = await getOriginPrivateDirectory(parsed)
    return publicHandle[kAdapter]
  } catch {
    return null
  }
}

/**
 * Wrap an adapter handle in a Proxy that overrides its `name` property.
 * Used to make `.fslink` targets appear under the link's stem name rather
 * than their own name (analogous to how a symlink is addressed by its own
 * name, not the target's name).
 *
 * @param {object} handle  - raw adapter handle
 * @param {string} name    - the stem name to expose
 * @returns {object}  proxied adapter handle
 */
function aliasName (handle, name) {
  return new Proxy(handle, {
    get (target, prop, receiver) {
      if (prop === 'name') return name
      const val = Reflect.get(target, prop, receiver)
      return typeof val === 'function' ? val.bind(target) : val
    }
  })
}

// ---------------------------------------------------------------------------
// CowFileHandle
// ---------------------------------------------------------------------------

/**
 * A lazy CoW file handle returned when a file exists only in the base adapter.
 *
 * - `getFile()` is delegated straight to the base handle.
 * - `createWritable()` triggers the actual "copy": the base file content is
 *   copied into a fresh `MemFileHandle` stored in the parent overlay folder,
 *   and a writable sink on that copy is returned.  Subsequent calls to either
 *   `getFile()` or `createWritable()` on this handle will delegate to the
 *   overlay copy.
 */
export class CowFileHandle {
  /**
   * @param {string} name
   * @param {object} baseHandle  - adapter FileHandle from the base
   * @param {MemFolderHandle} overlayParent  - the overlay FolderHandle that
   *   should receive the copied entry on first write
   */
  constructor (name, baseHandle, overlayParent) {
    this._name = name
    this._base = baseHandle
    this._overlayParent = overlayParent
    this._overlayHandle = null // set after first copy
    this.kind = 'file'
    this.writable = true
    this.readable = true
  }

  get name () { return this._name }

  async getFile () {
    if (this._overlayHandle) return this._overlayHandle.getFile()
    return this._base.getFile()
  }

  /**
   * Copy-on-write: copy the base file into the overlay on first write, then
   * return a writable sink on the overlay copy.
   *
   * @param {{ keepExistingData?: boolean, mode?: string }} opts
   */
  async createWritable (opts = {}) {
    if (!this._overlayHandle) {
      // Perform the copy: read the base file and store it in the overlay.
      const baseFile = await this._base.getFile()
      const copyFile = new File([baseFile], this._name, { lastModified: Date.now() })
      const mem = new MemFileHandle(this._name, copyFile, true)
      this._overlayParent._entries[this._name] = mem
      this._overlayHandle = mem
    }
    return this._overlayHandle.createWritable(opts)
  }

  async isSameEntry (other) {
    return this === other
  }

  async remove () {
    // Mark as deleted in overlay; base stays untouched.
    this._overlayParent._entries[this._name] = TOMBSTONE
    this._overlayHandle = null
  }
}

// ---------------------------------------------------------------------------
// CowFolderHandle
// ---------------------------------------------------------------------------

/**
 * Copy-on-write directory adapter.
 *
 * Merges a base adapter FolderHandle with an in-memory overlay FolderHandle.
 * Overlay entries take precedence over base entries.  TOMBSTONE entries in
 * the overlay hide base entries that have been "deleted".
 *
 * `.fslink` files in either layer are transparently resolved to the handles
 * they point to and exposed under their stem name (sans `.fslink`).
 */
export class CowFolderHandle {
  /**
   * @param {string} name
   * @param {object|null} base  - any adapter FolderHandle, or null for
   *   overlay-only (newly created) directories
   * @param {MemFolderHandle} [overlay]  - backing memory overlay; created
   *   fresh if not provided
   */
  constructor (name, base, overlay = new MemFolderHandle(name)) {
    this.name = name
    this.kind = 'directory'
    this.writable = true
    this.readable = true
    this._base = base
    this._overlay = overlay
  }

  // -------------------------------------------------------------------------
  // entries()
  // -------------------------------------------------------------------------

  /**
   * Yield all visible entries, merging overlay (wins) and base (fallback).
   * TOMBSTONE entries are skipped.  `.fslink` entries are resolved and yielded
   * under their stem name; broken links are silently omitted.
   *
   * @returns {AsyncGenerator<[string, object]>}
   */
  async * entries () {
    const seen = new Set()

    // --- overlay pass ---
    for (const [name, entry] of Object.entries(this._overlay._entries)) {
      if (entry === TOMBSTONE) {
        seen.add(name)
        // Also mark the .fslink variant as seen so base doesn't surface it.
        seen.add(name + '.fslink')
        continue
      }

      if (name.endsWith('.fslink')) {
        const stemName = name.slice(0, -'.fslink'.length)
        seen.add(name)
        seen.add(stemName)
        const resolved = await resolveFsLink(entry)
        if (resolved !== null) yield [stemName, aliasName(resolved, stemName)]
        // else: broken link — silently skip
      } else {
        seen.add(name)
        // If there's an overlay .fslink for this stem, mark it seen too.
        seen.add(name + '.fslink')
        yield [name, entry]
      }
    }

    // --- base pass ---
    if (this._base) {
      for await (const [name, entry] of this._base.entries()) {
        if (seen.has(name)) continue

        if (name.endsWith('.fslink')) {
          const stemName = name.slice(0, -'.fslink'.length)
          if (seen.has(stemName)) continue
          seen.add(name)
          seen.add(stemName)
          const resolved = await resolveFsLink(entry)
          if (resolved !== null) yield [stemName, aliasName(resolved, stemName)]
          // else: broken link — silently skip
        } else {
          seen.add(name)
          seen.add(name + '.fslink')
          yield [name, entry]
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // getFileHandle()
  // -------------------------------------------------------------------------

  /**
   * @param {string} name
   * @param {{ create?: boolean }} [opts]
   * @returns {Promise<object>}  adapter FileHandle
   */
  async getFileHandle (name, opts = {}) {
    const { create = false } = opts

    // 1. Check overlay for an exact match.
    const overlayEntry = this._overlay._entries[name]
    if (overlayEntry === TOMBSTONE) throw new DOMException(...GONE)
    if (overlayEntry instanceof MemFileHandle) return overlayEntry

    // 2. Check overlay for a .fslink backing entry.
    const overlayLink = this._overlay._entries[name + '.fslink']
    if (overlayLink !== undefined && overlayLink !== TOMBSTONE) {
      const resolved = await resolveFsLink(overlayLink)
      if (resolved !== null) {
        if (resolved.kind !== 'file') throw new DOMException(...MISMATCH)
        return aliasName(resolved, name)
      }
      // Broken link — fall through.
    }

    // 3. Try base for an exact match.
    if (this._base) {
      let baseEntry = null
      try { baseEntry = await this._base.getFileHandle(name, { create: false }) } catch { /* not found */ }
      if (baseEntry !== null) {
        if (baseEntry.kind !== 'file') throw new DOMException(...MISMATCH)
        return new CowFileHandle(name, baseEntry, this._overlay)
      }

      // 4. Try base for a .fslink entry.
      let baseLinkEntry = null
      try { baseLinkEntry = await this._base.getFileHandle(name + '.fslink', { create: false }) } catch { /* not found */ }
      if (baseLinkEntry !== null) {
        const resolved = await resolveFsLink(baseLinkEntry)
        if (resolved !== null) {
          if (resolved.kind !== 'file') throw new DOMException(...MISMATCH)
          return aliasName(resolved, name)
        }
        // Broken link — fall through.
      }
    }

    // 5. Create in overlay if requested.
    if (create) return this._overlay.getFileHandle(name, { create: true })

    throw new DOMException(...GONE)
  }

  // -------------------------------------------------------------------------
  // getDirectoryHandle()
  // -------------------------------------------------------------------------

  /**
   * @param {string} name
   * @param {{ create?: boolean }} [opts]
   * @returns {Promise<CowFolderHandle>}
   */
  async getDirectoryHandle (name, opts = {}) {
    const { create = false } = opts

    // 1. Check overlay for an exact match.
    const overlayEntry = this._overlay._entries[name]
    if (overlayEntry === TOMBSTONE) throw new DOMException(...GONE)

    if (overlayEntry instanceof MemFolderHandle) {
      // Look up the corresponding base sub-dir (may not exist).
      let baseSubDir = null
      if (this._base) {
        try { baseSubDir = await this._base.getDirectoryHandle(name, { create: false }) } catch { /* not found */ }
      }
      return new CowFolderHandle(name, baseSubDir, overlayEntry)
    }

    // 2. Check overlay for a .fslink backing entry.
    const overlayLink = this._overlay._entries[name + '.fslink']
    if (overlayLink !== undefined && overlayLink !== TOMBSTONE) {
      const resolved = await resolveFsLink(overlayLink)
      if (resolved !== null) {
        if (resolved.kind !== 'directory') throw new DOMException(...MISMATCH)
        // Return the foreign adapter directly (aliased to the stem name).
        return aliasName(resolved, name)
      }
      // Broken link — fall through.
    }

    // 3. Try base for an exact match.
    if (this._base) {
      let baseSubDir = null
      try { baseSubDir = await this._base.getDirectoryHandle(name, { create: false }) } catch { /* not found */ }

      if (baseSubDir !== null) {
        // Lazily create the overlay sub-dir so writes have somewhere to land.
        const overlaySubDir = await this._overlay.getDirectoryHandle(name, { create: true })
        return new CowFolderHandle(name, baseSubDir, overlaySubDir)
      }

      // 4. Try base for a .fslink entry.
      let baseLinkEntry = null
      try { baseLinkEntry = await this._base.getFileHandle(name + '.fslink', { create: false }) } catch { /* not found */ }
      if (baseLinkEntry !== null) {
        const resolved = await resolveFsLink(baseLinkEntry)
        if (resolved !== null) {
          if (resolved.kind !== 'directory') throw new DOMException(...MISMATCH)
          return aliasName(resolved, name)
        }
        // Broken link — fall through.
      }
    }

    // 5. Create in overlay if requested (overlay-only dir, no base).
    if (create) {
      const overlaySubDir = await this._overlay.getDirectoryHandle(name, { create: true })
      return new CowFolderHandle(name, null, overlaySubDir)
    }

    throw new DOMException(...GONE)
  }

  // -------------------------------------------------------------------------
  // removeEntry()
  // -------------------------------------------------------------------------

  /**
   * Remove a named entry from the CoW view.
   *
   * If the entry lives only in the overlay it is deleted outright.  If it
   * also exists in the base a TOMBSTONE is written to the overlay so that
   * subsequent lookups hide it, without touching the base.
   *
   * @param {string} name
   * @param {{ recursive?: boolean }} [opts]
   */
  async removeEntry (name, opts = {}) {
    const overlayEntry = this._overlay._entries[name]

    if (overlayEntry === TOMBSTONE) throw new DOMException(...GONE)

    const existsInOverlay = overlayEntry !== undefined
    const existsInBase = this._base ? await this._baseHas(name) : false
    // Also check whether the backing storage is a .fslink.
    const linkName = name + '.fslink'
    const overlayLinkEntry = this._overlay._entries[linkName]
    const linkExistsInOverlay = overlayLinkEntry !== undefined && overlayLinkEntry !== TOMBSTONE
    const linkExistsInBase = this._base ? await this._baseHasFile(linkName) : false

    if (!existsInOverlay && !existsInBase && !linkExistsInOverlay && !linkExistsInBase) {
      throw new DOMException(...GONE)
    }

    if (existsInOverlay) {
      // Remove from overlay.
      if (existsInBase) {
        // Base still has it — leave a tombstone so it stays hidden.
        this._overlay._entries[name] = TOMBSTONE
      } else {
        // Overlay-only entry — actually delete it.
        await this._overlay.removeEntry(name, opts)
      }
    } else if (existsInBase) {
      // Only in base — write a tombstone.
      this._overlay._entries[name] = TOMBSTONE
    } else if (linkExistsInOverlay) {
      if (linkExistsInBase) {
        this._overlay._entries[linkName] = TOMBSTONE
      } else {
        await this._overlay.removeEntry(linkName, opts)
      }
    } else if (linkExistsInBase) {
      this._overlay._entries[linkName] = TOMBSTONE
    }
  }

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------

  /**
   * Remove this directory itself from its parent's CoW view.
   * Since adapters call `remove()` via `FileSystemHandle.remove()`, we just
   * clear the overlay and tombstone all base children so the directory appears
   * empty, then let the parent handle the actual deletion record.
   *
   * @param {{ recursive?: boolean }} [options]
   */
  async remove (options = {}) {
    const { recursive = false } = options

    // Check if empty (base + overlay, excluding tombstones).
    const hasChildren = await (async () => {
      for await (const _ of this.entries()) return true // eslint-disable-line no-unreachable-loop
      return false
    })()

    if (!recursive && hasChildren) {
      const { MOD_ERR } = errors
      throw new DOMException(...MOD_ERR)
    }

    // Clear overlay.
    this._overlay._entries = {}

    // Tombstone all base entries so they appear deleted.
    if (this._base) {
      for await (const [name] of this._base.entries()) {
        this._overlay._entries[name] = TOMBSTONE
      }
    }
  }

  // -------------------------------------------------------------------------
  // isSameEntry()
  // -------------------------------------------------------------------------

  async isSameEntry (other) {
    return this === other
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Returns true if `name` exists in the base as either a file or directory.
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async _baseHas (name) {
    if (!this._base) return false
    try { await this._base.getFileHandle(name, { create: false }); return true } catch { /* */ }
    try { await this._base.getDirectoryHandle(name, { create: false }); return true } catch { /* */ }
    return false
  }

  /**
   * Returns true if `name` exists in the base as a file.
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async _baseHasFile (name) {
    if (!this._base) return false
    try { await this._base.getFileHandle(name, { create: false }); return true } catch { return false }
  }
}

// ---------------------------------------------------------------------------
// Public factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a `.fslink` shortcut file inside any writable directory.
 *
 * The shortcut stores a JSON-serialised form of `targetHandle`.  When the
 * containing directory is accessed through a `CowFolderHandle`, the link is
 * transparently resolved and the target is exposed under `linkName`.
 *
 * @param {import('../FileSystemHandle.js').default} targetHandle  - the handle to link to
 * @param {import('../FileSystemDirectoryHandle.js').default} inDir  - writable directory to place the link in
 * @param {string} linkName  - entry name WITHOUT the `.fslink` extension
 */
export async function createFsLink (targetHandle, inDir, linkName) {
  const { serialize } = await import('../FileSystemHandle.js')
  const serialized = serialize(targetHandle)
  const file = await inDir.getFileHandle(linkName + '.fslink', { create: true })
  const writable = await file.createWritable()
  await writable.write(JSON.stringify(serialized))
  await writable.close()
}

/**
 * Wrap a public `FileSystemDirectoryHandle` in a CoW overlay and return a new
 * `FileSystemDirectoryHandle` backed by the CoW adapter.
 *
 * The original handle is never mutated; all writes go to the in-memory overlay.
 *
 * @param {import('../FileSystemDirectoryHandle.js').default} dirHandle
 * @returns {Promise<import('../FileSystemDirectoryHandle.js').default>}
 */
export async function wrapWithCow (dirHandle) {
  const { FileSystemDirectoryHandle } = await import('../FileSystemDirectoryHandle.js')
  const inner = dirHandle[kAdapter]
  return new FileSystemDirectoryHandle(new CowFolderHandle(dirHandle.name, inner))
}

/**
 * Create a raw (unwrapped) `CowFolderHandle` from a public
 * `FileSystemDirectoryHandle`.  Useful when you need direct adapter access.
 *
 * @param {import('../FileSystemDirectoryHandle.js').default} dirHandle
 * @returns {CowFolderHandle}
 */
export default function createCowAdapter (dirHandle) {
  const inner = dirHandle[kAdapter]
  return new CowFolderHandle(dirHandle.name, inner)
}
