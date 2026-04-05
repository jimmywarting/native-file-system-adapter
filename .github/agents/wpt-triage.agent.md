# WPT Triage Agent

**When to use:** Analyzing failing WPT subtests, minimizing WPT failures to root causes in adapter code, determining if a WPT failure belongs in the expected-failures allowlist or should be fixed.

## Workflow

### Step 1: Establish Baseline

Run the test suite to identify which tests are failing:

```bash
npm run test:wpt-node
```

### Step 2: Read Current Allowlist

```bash
cat test/wpt-expected-failures.json
```

Check if the failure is already listed. If it is, the failure is a known issue.

### Step 3: Read the Failing WPT Script

```bash
cat wpt/fs/script-tests/<script-name>.js
```

Identify:
- Which `directory_test` or `promise_test` is failing
- What assertion is being made
- What adapter methods are called

### Step 4: Map to Adapter Method

Use this reference:

| WPT Script | Adapter Method(s) |
|------------|-------------------|
| `FileSystemBaseHandle-remove.js` | `remove()` |
| `FileSystemDirectoryHandle-getDirectoryHandle.js` | `getDirectoryHandle()` |
| `FileSystemDirectoryHandle-getFileHandle.js` | `getFileHandle()` |
| `FileSystemDirectoryHandle-iteration.js` | `entries()` |
| `FileSystemDirectoryHandle-removeEntry.js` | `removeEntry()` |
| `FileSystemFileHandle-getFile.js` | `getFile()` |
| `FileSystemWritableFileStream*.js` | `createWritable()`, `Sink.write()`, `Sink.close()` |

### Step 5: Read the Adapter Implementation

```bash
# For memory adapter (ground truth)
cat src/adapters/memory.js

# For node adapter
cat src/adapters/node.js

# For deno adapter
cat src/adapters/deno.js
```

### Step 6: Check Spec Accuracy

Reference: https://fs.spec.whatwg.org/

Common spec behaviors:
- `remove()` on directory with open writable → `NoModificationAllowedError`
- `remove()` on non-empty directory (non-recursive) → `InvalidModificationError`
- `getFileHandle()` for existing file → return same handle
- `getDirectoryHandle()` for existing dir → return same handle
- `createWritable({keepExistingData: false})` → truncate file first

### Step 7: Determine Fix or Allowlist

**If fixable:**
1. Make minimal change to the relevant adapter
2. Re-run `npm run test:wpt-node`
3. Verify the test passes

**If not fixable (e.g., test harness limitation, spec deviation):**
Add entry to `test/wpt-expected-failures.json`:

```json
{
  "ScriptName.js": [
    {
      "name": "Exact test description",
      "reason": "Clear explanation of why this fails"
    }
  ]
}
```

## Common Failure Patterns

| Error Pattern | Likely Cause | Fix |
|---------------|--------------|-----|
| `Promise resolves but should reject` | Missing check or wrong error thrown | Add proper validation and throw correct `DOMException` |
| `TypeError` instead of `DOMException` | Using native Error | Wrap with `throw new DOMException(...)` |
| `InvalidModificationError` instead of `NoModificationAllowedError` | Wrong error constant | Check `src/util.js` error mapping |
| Size overcounting on overwrite | Unconditional size += | Use `Math.max(this._size, position + bytesWritten)` |
| Parent removed but write succeeds | No parent existence check | Track parent path and check before writes |

## Example Triage

**Failure:** `remove() to remove an empty directory` fails with `EISDIR`

**Analysis:**
1. Read WPT script: Test calls `dir.remove()` on an empty directory
2. Read node adapter: Uses `fs.rm()` for directory removal
3. Problem: `fs.rm()` with `recursive: false` throws `EISDIR` on directories
4. Fix: Use `fs.rmdir()` for non-recursive directory removal

**Output:**
- Root cause: `fs.rm()` is wrong for non-recursive directory removal
- Fix: Change to `fs.rmdir()` with proper error mapping
- Test after fix: Verify test passes
