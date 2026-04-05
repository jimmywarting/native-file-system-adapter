# Native File System Adapter — Copilot Workspace Instructions

## Project Overview

This is a WHATWG File System Access API polyfill. It provides browser-compatible `FileSystemHandle`, `FileSystemDirectoryHandle`, and `FileSystemFileHandle` interfaces backed by various storage backends (memory, Node.js fs, Deno fs, IndexedDB, Cache API, jsDelivr CDN).

## Adapter Contract

Every adapter in `src/adapters/` must implement the following interface. The polyfill wraps these adapters with `FileSystemDirectoryHandle` / `FileSystemFileHandle` which call adapter methods directly.

### Directory Handle Methods

| Method | Signature | Notes |
|--------|-----------|-------|
| `entries()` | `async *entries(): AsyncGenerator<[string, FileHandle \| FolderHandle]>` | Yields `[name, handle]` pairs |
| `getDirectoryHandle(name, opts)` | `opts: { create?: boolean }` | Returns `FolderHandle` or throws |
| `getFileHandle(name, opts)` | `opts: { create?: boolean }` | Returns `FileHandle` or throws |
| `removeEntry(name, opts)` | `opts: { recursive?: boolean }` | Recursively removes entries |
| `remove(options)` | `options: { recursive?: boolean }` | Removes this directory (must delete from parent) |
| `isSameEntry(other)` | `other: FolderHandle` | Compares by identity or path |

### File Handle Methods

| Method | Signature | Notes |
|--------|-----------|-------|
| `getFile()` | `async getFile(): Promise<File>` | Returns a File/Blob |
| `createWritable(opts)` | `opts: { keepExistingData?: boolean }` | Returns a `Sink` (writable stream) |
| `remove()` | `async remove()` | Removes this file (must delete from parent) |
| `isSameEntry(other)` | `other: FileHandle` | Compares by identity or path |

### Sink (Writable Stream) Interface

| Method | Signature | Notes |
|--------|-----------|-------|
| `write(chunk)` | `chunk: Uint8Array \| Buffer \| string \| Blob \| WriteParams` | Write data |
| `close()` | `async close()` | Finalize and commit |
| `abort()` | `async abort()` | Cancel and discard |

Write params:
- `{ type: 'write', data: ..., position?: number }`
- `{ type: 'seek', position: number }`
- `{ type: 'truncate', size: number }`

## Error Name Mapping

**Always use `DOMException` with these exact names.** Import from `src/util.js`:

```javascript
import { errors } from '../util.js'
const { INVALID, GONE, MISMATCH, MOD_ERR, SYNTAX, SECURITY, DISALLOWED } = errors
```

| Name | Message | When to throw |
|------|---------|---------------|
| `NotFoundError` | "A requested file or directory could not be found..." | Entry doesn't exist, parent removed |
| `TypeMismatchError` | "The path supplied exists, but was not an entry of requested type." | File exists when directory expected |
| `InvalidModificationError` | "The object can not be modified in this way." | Non-empty dir remove, ENOTEMPTY |
| `InvalidStateError` | "seeking position failed." | Seek past EOF |
| `SyntaxError` | "Failed to execute 'write'..." | Invalid write params |
| `NotAllowedError` | "The request is not allowed..." | Read-only adapter (jsdelivr) |
| `SecurityError` | "It was determined that certain files are unsafe..." | Reserved |

Usage: `throw new DOMException(...GONE)` — GONE is an array `[message, name]`.

## WPT Script → Adapter Method Coverage Matrix

| WPT Script | Adapter Methods Tested | Known Issues |
|------------|----------------------|--------------|
| `FileSystemDirectoryHandle-getDirectoryHandle.js` | `getDirectoryHandle()` | Path separator validation |
| `FileSystemDirectoryHandle-getFileHandle.js` | `getFileHandle()` | Path separator validation |
| `FileSystemDirectoryHandle-iteration.js` | `entries()` | — |
| `FileSystemDirectoryHandle-removeEntry.js` | `removeEntry()` | Open writable tracking |
| `FileSystemDirectoryHandle-resolve.js` | `resolve()` (via wrapper) | — |
| `FileSystemFileHandle-getFile.js` | `getFile()` | Filename preservation |
| `FileSystemWritableFileStream.js` | `createWritable()`, `Sink.write()`, `Sink.close()` | Atomic semantics |
| `FileSystemWritableFileStream-write.js` | `Sink.write()` | Null data handling |
| `FileSystemWritableFileStream-piped.js` | `ReadableStream.pipeTo()` | Node.js streaming |
| `FileSystemBaseHandle-isSameEntry.js` | `isSameEntry()` | Memory adapter identity |
| `FileSystemBaseHandle-remove.js` | `remove()` | Open writable tracking |

## Before Touching an Adapter

1. Run `npm run test:wpt-node` to establish baseline
2. Read the failing WPT script: `wpt/fs/script-tests/<name>.js`
3. Identify which adapter method is tested
4. Read the spec: https://fs.spec.whatwg.org/
5. Make minimal fix
6. Re-run tests before committing

## Key Files

- `src/util.js` — Error definitions and utilities
- `src/FileSystemHandle.js` — Base handle wrapper (calls `adapter.remove()`)
- `src/FileSystemDirectoryHandle.js` — Directory handle wrapper
- `src/FileSystemFileHandle.js` — File handle wrapper
- `src/adapters/memory.js` — In-memory adapter (ground truth)
- `src/adapters/node.js` — Node.js fs adapter
- `src/adapters/deno.js` — Deno fs adapter
- `src/adapters/indexeddb.js` — IndexedDB adapter
- `src/adapters/cache.js` — Cache API adapter
- `src/adapters/jsdelivr.js` — Read-only jsDelivr CDN adapter
- `test/wpt-expected-failures.json` — Known failures by script
