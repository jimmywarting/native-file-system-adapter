# Spec Traceability Agent

**When to use:** Checking whether a specific WHATWG File System spec operation is correctly implemented, finding which adapters are missing a behavior, or before starting work on a new spec section.

## Workflow

### Step 1: Identify the Spec Section

The WHATWG File System Access spec is at: https://fs.spec.whatwg.org/

Key sections:
- [FileSystemHandle removal](https://fs.spec.whatwg.org/#dom-filesystemhandle-remove)
- [FileSystemDirectoryHandle.getDirectoryHandle](https://fs.spec.whatwg.org/#dictdef-filesystemgetdirectoryhandleoptions)
- [FileSystemDirectoryHandle.getFileHandle](https://fs.spec.whatwg.org/#dictdef-filesystemgetfilehandleoptions)
- [FileSystemWritableFileStream.write](https://fs.spec.whatwg.org/#dictdef-filesystemwriteparams)
- [FileSystemDirectoryHandle.removeEntry](https://fs.spec.whatwg.org/#dictdef-filesystemremoveoptions)

### Step 2: Map Spec Algorithm to Implementation

Read the implementation files:

```bash
# Polyfill wrappers
cat src/FileSystemHandle.js      # remove() method
cat src/FileSystemDirectoryHandle.js  # getDirectoryHandle, getFileHandle, removeEntry
cat src/FileSystemFileHandle.js   # getFile, createWritable

# Adapters
cat src/adapters/memory.js       # Ground truth implementation
cat src/adapters/node.js         # Node.js fs
cat src/adapters/deno.js         # Deno fs
cat src/adapters/indexeddb.js     # IndexedDB
cat src/adapters/cache.js         # Cache API
```

### Step 3: Extract Error Constants

```bash
cat src/util.js
```

Error mapping:
```javascript
INVALID: ['seeking position failed.', 'InvalidStateError']
GONE: ['A requested file or directory could not be found...', 'NotFoundError']
MISMATCH: ['The path supplied exists, but was not...', 'TypeMismatchError']
MOD_ERR: ['The object can not be modified in this way.', 'InvalidModificationError']
SYNTAX: m => ['Failed to execute...', 'SyntaxError']
DISALLOWED: ['The request is not allowed...', 'NotAllowedError']
```

### Step 4: Create Coverage Table

For each spec step, document:

| Spec Step | memory.js | node.js | deno.js | indexeddb.js | cache.js | Notes |
|-----------|-----------|---------|---------|--------------|----------|-------|
| `remove()` throws NotFoundError if gone | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `remove()` on non-empty dir (no recursive) | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `remove()` on dir with open writable | ✗ | ✗ | ✗ | ✗ | ✗ | Known gap |
| `createWritable(keepExistingData: false)` truncates | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `write()` with position > size pads | ✓ | ✓ | ✓ | ✓ | ✓ | |

### Step 5: Flag Deviations

Mark any step that:
1. Throws wrong error type
2. Skips validation entirely
3. Has incorrect atomicity semantics
4. Missing edge case handling

Example flags:
```
[WRONG ERROR] node.js: Sink.write() throws SyntaxError instead of TypeError for invalid position
[SKIP] deno.js: FolderHandle.remove() doesn't check for open writables
[ATOMICITY] node.js: createWritable({keepExistingData: false}) doesn't truncate atomically
```

## Coverage Matrix Template

Copy this template when starting a new spec section analysis:

```markdown
## [Spec Section Name]

Spec: https://fs.spec.whatwg.org/#[anchor]

### Algorithm Steps

| Step | Description | memory | node | deno | idb | cache |
|------|-------------|--------|------|------|-----|-------|
| 1 | [Step description] | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | Notes |
| 2 | ... | | | | | | |

### Deviations

- **[ADAPTER]**: [Issue description]
```

## Quick Reference: Spec → Adapter Method Mapping

| Spec Operation | Wrapper Method | Adapter Method |
|---------------|----------------|----------------|
| `FileSystemHandle.remove()` | `FileSystemHandle.remove()` | `remove()` |
| `FileSystemDirectoryHandle.getDirectoryHandle()` | `getDirectoryHandle()` | `getDirectoryHandle()` |
| `FileSystemDirectoryHandle.getFileHandle()` | `getFileHandle()` | `getFileHandle()` |
| `FileSystemDirectoryHandle.removeEntry()` | `removeEntry()` | `removeEntry()` |
| `FileSystemDirectoryHandle.resolve()` | `resolve()` | (wrapper only) |
| `FileSystemFileHandle.getFile()` | `getFile()` | `getFile()` |
| `FileSystemFileHandle.createWritable()` | `createWritable()` | `createWritable()` |
