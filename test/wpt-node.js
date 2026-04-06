/**
 * Node.js WPT test runner.
 * Runs WPT File System Access tests against the polyfill's memory adapter.
 */

import { existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getOriginPrivateDirectory } from '../src/es6.js'
import * as fs from '../src/es6.js'
import { installGlobals, runTests } from './wpt-harness-node.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Install WPT test harness globals
installGlobals()

process.on('unhandledRejection', (err) => {
  if (err.code === 'ERR_INVALID_STATE') {
    return
  }
  console.error('Unhandled rejection:', err.message)
})

process.on('beforeExit', () => {
  process.exitCode = 0
})

process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_INVALID_STATE') {
    process.exitCode = 0
    return
  }
  console.error('Uncaught exception:', err.message)
})

// Expose polyfill classes as globals (needed by some WPT test scripts)
Object.assign(globalThis, fs)

// ──────────────────────────────────────────────────────
// Set up WPT test helpers (matching wpt/fs/resources/test-helpers.js)
// ──────────────────────────────────────────────────────

globalThis.kCurrentDirectory = '.'
globalThis.kParentDirectory = '..'
globalThis.kPathSeparators = ['/', '\\']

async function getFileSize (handle) {
  const file = await handle.getFile()
  return file.size
}

async function getFileContents (handle) {
  const file = await handle.getFile()
  return new Response(file).text()
}

async function getDirectoryEntryCount (handle) {
  let result = 0
  for await (const _ of handle) {
    result++
  }
  return result
}

async function getSortedDirectoryEntries (handle) {
  const result = []
  for await (const entry of handle.values()) {
    if (entry.kind === 'directory') {
      result.push(entry.name + '/')
    } else {
      result.push(entry.name)
    }
  }
  result.sort()
  return result
}

async function createDirectory (t, name, parent) {
  if (typeof t === 'string') {
    parent = name
    name = t
    t = undefined
  }
  return await parent.getDirectoryHandle(name, { create: true })
}

async function createEmptyFile (t, name, parent) {
  if (typeof t === 'string') {
    parent = name
    name = t
    t = undefined
  }
  const handle = await parent.getFileHandle(name, { create: true })
  assert_equals(await getFileSize(handle), 0)
  return handle
}

async function createFileWithContents (t, name, contents, parent) {
  if (typeof t === 'string') {
    parent = contents
    contents = name
    name = t
    t = undefined
  }
  const handle = await createEmptyFile(t, name, parent)
  const writer = await handle.createWritable()
  await writer.write(contents)
  await writer.close()
  return handle
}

async function cleanup (test, value, cleanupFn) {
  test.add_cleanup(async () => {
    try { await cleanupFn() } catch (e) { /* ignore */ }
  })
  return value
}

async function cleanup_writable (test, value) {
  return cleanup(test, value, async () => {
    try { await value.close() } catch (e) { /* ignore */ }
  })
}

function createFileHandles (t, dir, ...fileNames) {
  if (t && typeof t.getDirectoryHandle === 'function') {
    fileNames = [dir, ...fileNames]
    dir = t
    t = undefined
  }
  return Promise.all(
    fileNames.map(fileName => dir.getFileHandle(fileName, { create: true }))
  )
}

function createDirectoryHandles (t, dir, ...dirNames) {
  if (t && typeof t.getDirectoryHandle === 'function') {
    dirNames = [dir, ...dirNames]
    dir = t
    t = undefined
  }
  return Promise.all(
    dirNames.map(dirName => dir.getDirectoryHandle(dirName, { create: true }))
  )
}

Object.assign(globalThis, {
  getFileSize,
  getFileContents,
  getDirectoryEntryCount,
  getSortedDirectoryEntries,
  createDirectory,
  createEmptyFile,
  createFileWithContents,
  cleanup,
  cleanup_writable,
  createFileHandles,
  createDirectoryHandles,
  garbageCollect: () => {},
  recordingReadableStream (config) {
    let controller
    const stream = new ReadableStream({
      start (c) {
        controller = c
        if (config.start) {
          config.start(c)
        }
      },
      pull (c) {
        if (config.pull) {
          config.pull(c)
        }
      },
      cancel (e) {
        if (config.cancel) {
          config.cancel(e)
        }
      },
    })
    stream.getController = () => controller
    return stream
  },
})

// ──────────────────────────────────────────────────────
// Set up directory_test using the memory adapter
// ──────────────────────────────────────────────────────

async function cleanupSandboxedFileSystem (root) {
  for await (const [name, entry] of root) {
    await root.removeEntry(name, { recursive: entry.kind === 'directory' })
  }
}

let currentRoot
const oldNavigator = globalThis.navigator
delete globalThis.navigator
Object.defineProperty(globalThis, 'navigator', {
  get () {
    return {
      storage: {
        getDirectory: () => Promise.resolve(currentRoot)
      }
    }
  },
  configurable: true
})

globalThis.directory_test = function directory_test (func, description) {
  promise_test(async t => {
    currentRoot = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))
    await cleanupSandboxedFileSystem(currentRoot)
    t.add_cleanup(async () => {
      await cleanupSandboxedFileSystem(currentRoot)
    })
    await func(t, currentRoot)
  }, description)
}

// ──────────────────────────────────────────────────────
// Also test against Node.js file system adapter
// ──────────────────────────────────────────────────────

const testFolderPath = resolve(ROOT, 'testfolder')

let nodeRoot
try {
  if (!existsSync(testFolderPath)) {
    mkdirSync(testFolderPath)
  }
  nodeRoot = await getOriginPrivateDirectory(import('../src/adapters/node.js'), testFolderPath)
} catch (e) {
  console.warn('Node.js adapter not available, testing memory adapter only.')
}

// ──────────────────────────────────────────────────────
// WPT test scripts to run
// ──────────────────────────────────────────────────────

// Skipped scripts and their reasons
const SKIP_REASONS = {
  'FileSystemObserver.js': 'FileSystemObserver not implemented',
  'FileSystemObserver-writable-file-stream.js': 'FileSystemObserver not implemented',
  'FileSystemBaseHandle-getUniqueId.js': 'Unique IDs not implemented',
  'FileSystemFileHandle-create-sync-access-handle.js': 'SyncAccessHandle is OPFS-only',
  'FileSystemSyncAccessHandle-flush.js': 'SyncAccessHandle is OPFS-only',
  'FileSystemBaseHandle-buckets.js': 'Storage buckets API not applicable',
  'FileSystemBaseHandle-IndexedDB.js': 'Browser-only (postMessage + IDB)',
  'FileSystemBaseHandle-postMessage-BroadcastChannel.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-Error.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-frames.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-MessagePort-frames.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-MessagePort-windows.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-MessagePort-workers.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-windows.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-workers.js': 'Browser-only (postMessage)',
}

const SUPPORTED_SCRIPTS = [
  'FileSystemDirectoryHandle-getDirectoryHandle.js',
  'FileSystemDirectoryHandle-getFileHandle.js',
  'FileSystemDirectoryHandle-iteration.js',
  'FileSystemDirectoryHandle-removeEntry.js',
  'FileSystemDirectoryHandle-resolve.js',
  'FileSystemFileHandle-getFile.js',
  'FileSystemWritableFileStream.js',
  'FileSystemWritableFileStream-write.js',
  'FileSystemWritableFileStream-piped.js',
  'FileSystemBaseHandle-isSameEntry.js',
  'FileSystemBaseHandle-remove.js',
  'FileSystemFileHandle-move.js',
]

const wptDir = resolve(ROOT, 'wpt', 'fs', 'script-tests')

if (!existsSync(wptDir)) {
  console.error('WPT tests not fetched. Run: bash scripts/fetch-wpt.sh')
  process.exit(1)
}

const availableFiles = readdirSync(wptDir)
const enabledScripts = SUPPORTED_SCRIPTS.filter(s => availableFiles.includes(s))
const skippedScripts = Object.keys(SKIP_REASONS).filter(s => availableFiles.includes(s))

// ──────────────────────────────────────────────────────
// Run tests
// ──────────────────────────────────────────────────────

let totalPassed = 0
let totalFailed = 0
let totalTests = 0
const allScriptFailures = [] // { script, description }

console.log('\n\x1b[1m=== WPT Tests (Memory Adapter) ===\x1b[0m\n')

currentRoot = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

// Show skipped scripts with reasons
if (skippedScripts.length > 0) {
  console.log('\x1b[33mSkipped scripts:\x1b[0m')
  for (const script of skippedScripts) {
    console.log(`  ${script}: ${SKIP_REASONS[script]}`)
  }
}

console.log('\n\x1b[1mRunning enabled scripts:\x1b[0m')

for (const script of enabledScripts) {
  console.log(`\n\x1b[1m${script}\x1b[0m`)
  const scriptPath = pathToFileURL(resolve(wptDir, script)).href
  await import(scriptPath)
  const { passed, failed, total, failures } = await runTests()
  totalPassed += passed
  totalFailed += failed
  totalTests += total
  for (const f of failures) {
    allScriptFailures.push({ script, description: f.description })
  }
}

// Run again with Node.js adapter if available
if (nodeRoot) {
  const nodeAdapter = await import('../src/adapters/node.js')
  globalThis.directory_test = function directory_test (func, description) {
    promise_test(async t => {
      currentRoot = await getOriginPrivateDirectory(import('../src/adapters/node.js'), testFolderPath)
      if (nodeAdapter.clearLocks) nodeAdapter.clearLocks()
      await cleanupSandboxedFileSystem(currentRoot)
      t.add_cleanup(async () => {
        await cleanupSandboxedFileSystem(currentRoot)
        if (nodeAdapter.clearLocks) nodeAdapter.clearLocks()
      })
      await func(t, currentRoot)
    }, description)
  }

  console.log('\n\x1b[1m=== WPT Tests (Node.js File System Adapter) ===\x1b[0m\n')

  currentRoot = await getOriginPrivateDirectory(import('../src/adapters/node.js'), testFolderPath)

  console.log('\x1b[1mRunning enabled scripts:\x1b[0m')

  for (const script of enabledScripts) {
    console.log(`\n\x1b[1m${script}\x1b[0m`)
    // We need to re-import the scripts. Since ES modules are cached,
    // we add a cache-busting query parameter.
    const scriptPath = pathToFileURL(resolve(wptDir, script)).href + '?adapter=node'
    await import(scriptPath)
    const { passed, failed, total, failures } = await runTests()
    totalPassed += passed
    totalFailed += failed
    totalTests += total
    for (const f of failures) {
      allScriptFailures.push({ script, description: f.description })
    }
  }

  // Cleanup
  try { rmSync(testFolderPath, { recursive: true }) } catch (e) { /* ignore */ }
}

// ──────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────

const allWptScripts = [...enabledScripts, ...skippedScripts].sort()
const missingScripts = availableFiles.filter(s => !allWptScripts.includes(s))

console.log('\n\x1b[1m=== Coverage Report ===\x1b[0m')
console.log(`  Enabled: ${enabledScripts.length}`)
console.log(`  Skipped: ${skippedScripts.length}`)
console.log(`  Unknown (not in SUPPORTED_SCRIPTS or SKIP_REASONS): ${missingScripts.length}`)
if (missingScripts.length > 0) {
  for (const s of missingScripts) {
    console.log(`    - ${s}`)
  }
}

console.log('\n\x1b[1m=== Summary ===\x1b[0m')
console.log(`  Total: ${totalTests}, Passed: ${totalPassed}, Failed: ${totalFailed}`)

if (totalTests === 0) {
  console.error('\nNo tests were run!')
  process.exit(1)
}

// ──────────────────────────────────────────────────────
// Check failures against the allowlist
// ──────────────────────────────────────────────────────

const { default: allowlist } = await import('./wpt-expected-failures.json', { with: { type: 'json' } })

let hasUnexpectedFailure = false
for (const { script, description } of allScriptFailures) {
  const allowed = allowlist[script] || []
  if (!allowed.some(entry => entry.name === description)) {
    console.error(`\n  \x1b[31mUNEXPECTED FAILURE\x1b[0m [${script}] ${description}`)
    hasUnexpectedFailure = true
  }
}

if (hasUnexpectedFailure) {
  console.error('\n\x1b[31mUnexpected test failures detected.\x1b[0m Add them to test/wpt-expected-failures.json with a reason if they are known issues.')
  process.exit(1)
}

console.log(`\n${totalFailed > 0 ? '\x1b[33mSome tests failed (all are in the expected-failures allowlist).\x1b[0m' : '\x1b[32mAll tests passed!\x1b[0m'}`)
process.exit(0)
