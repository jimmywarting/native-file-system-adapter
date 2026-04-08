/**
 * Copy-on-write overlay adapter with .fslink shortcut support.
 *
 * Wraps any base adapter with a second writable overlay adapter. Reads fall
 * through to the base unless the overlay has a newer copy. All writes land in
 * the overlay — the base is never mutated. Deletions are recorded as
 * tombstones in an in-memory Set on each directory handle.
 *
 * The overlay defaults to an in-memory adapter, but any writable adapter can
 * be supplied instead (e.g. OPFS for persistence across page reloads).
 *
 * Additionally, any entry whose name ends in `.fslink` is transparently
 * resolved: its content is read as a JSON-serialized handle (produced by
 * `serialize()`), deserialized via `getOriginPrivateDirectory()`, and exposed
 * to callers under the stem name (without the `.fslink` suffix). This lets
 * you "mount" arbitrary adapter handles into a CoW tree without touching any
 * core polyfill code.
 *
 * Usage (memory overlay — default):
 *   import { wrapWithCow, createFsLink } from './adapters/cow.js'
 *   import getOriginPrivateDirectory from './getOriginPrivateDirectory.js'
 *
 *   // Wrap a drag-dropped (read-only) directory so it appears writable:
 *   const base = await item.getAsFileSystemHandle()  // read-only sandbox handle
 *   const cow = await wrapWithCow(base)
 *
 *   // Now you can write without touching the original:
 *   const f = await cow.getFileHandle('notes.txt', { create: true })
 *   const w = await f.createWritable()
 *   await w.write('hello')
 *   await w.close()
 *
 * Usage (OPFS overlay — writes persist across page reloads):
 *   const base        = await item.getAsFileSystemHandle()
 *   const opfsOverlay = await getOriginPrivateDirectory()   // native OPFS root
 *   const cow = await wrapWithCow(base, opfsOverlay)
 *
 * Usage (.fslink shortcuts):
 *   // Create a .fslink shortcut pointing to an IDB-backed directory:
 *   const idbRoot = await getOriginPrivateDirectory(import('./indexeddb.js'))
 *   await createFsLink(idbRoot, cow, 'my-idb-mount')
 *
 *   // Iterate — 'my-idb-mount' appears as a normal directory entry:
 *   for await (const [name, handle] of cow) {
 *     console.log(name, handle.kind)  // 'my-idb-mount', 'directory'
 *   }
 */

import { FolderHandle as MemFolderHandle } from './memory.js'
import { errors } from '../util.js'
import { kAdapter } from '../FileSystemHandle.js'

const { GONE, MISMATCH } = errors

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
 * - `getFile()` is delegated straight to the base handle (or the overlay copy
 *   once a write has been made).
 * - `createWritable()` triggers the actual "copy": the base file content is
 *   written into a new file created via the parent's overlay adapter, and a
 *   writable sink on that copy is returned.  Subsequent calls delegate to the
 *   overlay copy.
 */
export class CowFileHandle {
  /**
   * @param {string} name
   * @param {object} baseHandle    - adapter FileHandle from the base
   * @param {CowFolderHandle} overlayParent - the CowFolderHandle whose overlay
   *   adapter should receive the copied entry on first write
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
   * If `keepExistingData` is true the base content is copied first so that
   * the caller starts writing from where the base file left off.  If false
   * (the default), the overlay file starts empty.
   *
   * @param {{ keepExistingData?: boolean, mode?: string }} opts
   */
  async createWritable (opts = {}) {
    if (!this._overlayHandle) {
      // Create a fresh file in the overlay adapter.
      const overlayFile = await this._overlayParent._overlay.getFileHandle(this._name, { create: true })

      if (opts.keepExistingData) {
        // Copy base content into the overlay file before handing it to the caller.
        const baseFile = await this._base.getFile()
        const copySink = await overlayFile.createWritable({ keepExistingData: false })
        await copySink.write(baseFile, 0)
        await copySink.close()
      }

      this._overlayHandle = overlayFile
    }
    return this._overlayHandle.createWritable(opts)
  }

  async isSameEntry (other) {
    return this === other
  }

  async remove () {
    // Remove the overlay copy (if any) and tombstone the base entry.
    if (this._overlayHandle) {
      try { await this._overlayParent._overlay.removeEntry(this._name, {}) } catch { /* already gone */ }
      this._overlayHandle = null
    }
    this._overlayParent._tombstones.add(this._name)
  }
}

// ---------------------------------------------------------------------------
// CowFolderHandle
// ---------------------------------------------------------------------------

/**
 * Copy-on-write directory adapter.
 *
 * Merges a base adapter FolderHandle with a writable overlay FolderHandle.
 * Overlay entries take precedence over base entries.  Deleted entries are
 * tracked in an in-memory `_tombstones` Set so the base is never mutated.
 *
 * The overlay can be any adapter FolderHandle — memory (default), OPFS,
 * IndexedDB, etc.  Only tombstones are always kept in-memory; if the overlay
 * itself persists (e.g. OPFS) then written/created files survive page reloads.
 *
 * `.fslink` files in either layer are transparently resolved to the handles
 * they point to and exposed under their stem name (sans `.fslink`).
 */
export class CowFolderHandle {
  /**
   * @param {string} name
   * @param {object|null} base     - any adapter FolderHandle, or null for
   *   overlay-only (newly created) directories
   * @param {object} [overlay]     - writable adapter FolderHandle used as the
   *   write layer; defaults to a fresh in-memory FolderHandle
   */
  constructor (name, base, overlay = new MemFolderHandle(name)) {
    this.name = name
    this.kind = 'directory'
    this.writable = true
    this.readable = true
    this._base = base
    this._overlay = overlay
    /** @type {Set<string>} Names deleted from this directory's CoW view. */
    this._tombstones = new Set()
  }

  // -------------------------------------------------------------------------
  // entries()
  // -------------------------------------------------------------------------

  /**
   * Yield all visible entries, merging overlay (wins) and base (fallback).
   * Tombstoned entries are skipped.  `.fslink` entries are resolved and yielded
   * under their stem name; broken links are silently omitted.
   *
   * @returns {AsyncGenerator<[string, object]>}
   */
  async * entries () {
    const seen = new Set()

    // Pre-populate `seen` from tombstones so base entries they shadow are skipped.
    for (const tombName of this._tombstones) {
      seen.add(tombName)
      // Tombstoning 'foo' hides 'foo.fslink' from base, and vice-versa.
      if (tombName.endsWith('.fslink')) {
        seen.add(tombName.slice(0, -'.fslink'.length))
      } else {
        seen.add(tombName + '.fslink')
      }
    }

    // --- overlay pass ---
    for await (const [name, entry] of this._overlay.entries()) {
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

    // 1. Check tombstone.
    if (this._tombstones.has(name)) throw new DOMException(...GONE)

    // 2. Check overlay for an exact match.
    try {
      return await this._overlay.getFileHandle(name, { create: false })
    } catch (e) {
      if (e.name !== 'NotFoundError') throw e
      // not in overlay — continue
    }

    // 3. Check overlay for a .fslink backing entry.
    if (!this._tombstones.has(name + '.fslink')) {
      try {
        const overlayLink = await this._overlay.getFileHandle(name + '.fslink', { create: false })
        const resolved = await resolveFsLink(overlayLink)
        if (resolved !== null) {
          if (resolved.kind !== 'file') throw new DOMException(...MISMATCH)
          return aliasName(resolved, name)
        }
        // Broken link — fall through.
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e
      }
    }

    // 4. Try base for an exact match.
    if (this._base) {
      try {
        const baseEntry = await this._base.getFileHandle(name, { create: false })
        return new CowFileHandle(name, baseEntry, this)
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e
      }

      // 5. Try base for a .fslink entry.
      try {
        const baseLinkEntry = await this._base.getFileHandle(name + '.fslink', { create: false })
        const resolved = await resolveFsLink(baseLinkEntry)
        if (resolved !== null) {
          if (resolved.kind !== 'file') throw new DOMException(...MISMATCH)
          return aliasName(resolved, name)
        }
        // Broken link — fall through.
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e
      }
    }

    // 6. Create in overlay if requested.
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

    // 1. Check tombstone.
    if (this._tombstones.has(name)) throw new DOMException(...GONE)

    // 2. Check overlay for an exact match (a sub-directory).
    try {
      const overlaySubDir = await this._overlay.getDirectoryHandle(name, { create: false })
      let baseSubDir = null
      if (this._base) {
        try { baseSubDir = await this._base.getDirectoryHandle(name, { create: false }) } catch { /* not in base */ }
      }
      return new CowFolderHandle(name, baseSubDir, overlaySubDir)
    } catch (e) {
      if (e.name !== 'NotFoundError') throw e
      // not in overlay — continue
    }

    // 3. Check overlay for a .fslink backing entry.
    if (!this._tombstones.has(name + '.fslink')) {
      try {
        const overlayLink = await this._overlay.getFileHandle(name + '.fslink', { create: false })
        const resolved = await resolveFsLink(overlayLink)
        if (resolved !== null) {
          if (resolved.kind !== 'directory') throw new DOMException(...MISMATCH)
          return aliasName(resolved, name)
        }
        // Broken link — fall through.
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e
      }
    }

    // 4. Try base for an exact match.
    if (this._base) {
      try {
        const baseSubDir = await this._base.getDirectoryHandle(name, { create: false })
        // Lazily create an overlay sub-dir so writes have somewhere to land.
        const overlaySubDir = await this._overlay.getDirectoryHandle(name, { create: true })
        return new CowFolderHandle(name, baseSubDir, overlaySubDir)
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e
      }

      // 5. Try base for a .fslink entry.
      try {
        const baseLinkEntry = await this._base.getFileHandle(name + '.fslink', { create: false })
        const resolved = await resolveFsLink(baseLinkEntry)
        if (resolved !== null) {
          if (resolved.kind !== 'directory') throw new DOMException(...MISMATCH)
          return aliasName(resolved, name)
        }
        // Broken link — fall through.
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e
      }
    }

    // 6. Create in overlay if requested (overlay-only dir, no base).
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
   * also exists in the base a tombstone is added so that subsequent lookups
   * hide it, without touching the base.
   *
   * @param {string} name
   * @param {{ recursive?: boolean }} [opts]
   */
  async removeEntry (name, opts = {}) {
    // Already tombstoned — treat as not found.
    if (this._tombstones.has(name)) throw new DOMException(...GONE)

    // Determine overlay/base presence for both the plain name and its .fslink variant.
    const linkName = name + '.fslink'
    const linkTombstoned = this._tombstones.has(linkName)

    const existsInBase = await this._baseHas(name)
    const linkExistsInBase = await this._baseHasFile(linkName)

    let existsInOverlay = false
    try { await this._overlay.getFileHandle(name, { create: false }); existsInOverlay = true } catch { /* not a file */ }
    if (!existsInOverlay) {
      try { await this._overlay.getDirectoryHandle(name, { create: false }); existsInOverlay = true } catch { /* not a directory */ }
    }

    let linkExistsInOverlay = false
    if (!linkTombstoned) {
      try { await this._overlay.getFileHandle(linkName, { create: false }); linkExistsInOverlay = true } catch { /* not found */ }
    }

    if (!existsInOverlay && !existsInBase && !linkExistsInOverlay && !linkExistsInBase) {
      throw new DOMException(...GONE)
    }

    if (existsInOverlay) {
      await this._overlay.removeEntry(name, opts)
      if (existsInBase) this._tombstones.add(name)
    } else if (existsInBase) {
      this._tombstones.add(name)
    } else if (linkExistsInOverlay) {
      await this._overlay.removeEntry(linkName, opts)
      if (linkExistsInBase) this._tombstones.add(linkName)
    } else if (linkExistsInBase) {
      this._tombstones.add(linkName)
    }
  }

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------

  /**
   * Remove this directory itself from its parent's CoW view.
   * Clears all overlay entries and tombstones all base children so the
   * directory appears empty/deleted from this handle's perspective.
   *
   * @param {{ recursive?: boolean }} [options]
   */
  async remove (options = {}) {
    const { recursive = false } = options

    // Check if empty (base + overlay, excluding tombstones).
    // We only need to know if at least one entry exists; return early on first hit.
    const hasChildren = await (async () => {
      for await (const firstEntry of this.entries()) { return true } // eslint-disable-line no-unused-vars
      return false
    })()

    if (!recursive && hasChildren) {
      const { MOD_ERR } = errors
      throw new DOMException(...MOD_ERR)
    }

    // Remove all overlay entries.
    const overlayNames = []
    for await (const [n] of this._overlay.entries()) overlayNames.push(n)
    for (const n of overlayNames) {
      try { await this._overlay.removeEntry(n, { recursive: true }) } catch { /* ignore */ }
    }

    // Tombstone all base entries so they appear deleted from this view.
    this._tombstones.clear()
    if (this._base) {
      for await (const [n] of this._base.entries()) {
        this._tombstones.add(n)
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
    try { await this._base.getFileHandle(name, { create: false }); return true } catch { /* not a file */ }
    try { await this._base.getDirectoryHandle(name, { create: false }); return true } catch { /* not a directory */ }
    return false
  }

  /**
   * Returns true if `name` exists in the base as a file.
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async _baseHasFile (name) {
    if (!this._base) return false
    try { await this._base.getFileHandle(name, { create: false }); return true } catch { /* not found */ }
    return false
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
 * The original handle (`dirHandle`) is used as the read-only base; all writes
 * go to the overlay.  The overlay defaults to a fresh in-memory adapter, but
 * any writable `FileSystemDirectoryHandle` can be supplied instead — for
 * example the OPFS root to persist changes across page reloads.
 *
 * @param {import('../FileSystemDirectoryHandle.js').default} dirHandle
 *   The base directory to wrap (read-only from CoW's perspective).
 * @param {import('../FileSystemDirectoryHandle.js').default} [overlayHandle]
 *   Optional writable directory to use as the overlay.  Defaults to an
 *   in-memory adapter.  Must support `getFileHandle`, `getDirectoryHandle`,
 *   `removeEntry`, and `entries`.
 * @returns {Promise<import('../FileSystemDirectoryHandle.js').default>}
 */
export async function wrapWithCow (dirHandle, overlayHandle) {
  const { FileSystemDirectoryHandle } = await import('../FileSystemDirectoryHandle.js')
  const inner = dirHandle[kAdapter]
  const overlayAdapter = overlayHandle
    ? overlayHandle[kAdapter]
    : new MemFolderHandle(dirHandle.name)
  return new FileSystemDirectoryHandle(new CowFolderHandle(dirHandle.name, inner, overlayAdapter))
}

/**
 * Create a raw (unwrapped) `CowFolderHandle` from a public
 * `FileSystemDirectoryHandle`.  Useful when you need direct adapter access.
 *
 * @param {import('../FileSystemDirectoryHandle.js').default} dirHandle
 *   The base directory to wrap.
 * @param {import('../FileSystemDirectoryHandle.js').default} [overlayHandle]
 *   Optional writable directory to use as the overlay.  Defaults to an
 *   in-memory adapter.
 * @returns {CowFolderHandle}
 */
export default function createCowAdapter (dirHandle, overlayHandle) {
  const inner = dirHandle[kAdapter]
  const overlayAdapter = overlayHandle
    ? overlayHandle[kAdapter]
    : new MemFolderHandle(dirHandle.name)
  return new CowFolderHandle(dirHandle.name, inner, overlayAdapter)
}
