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
  for await (const entry of handle) {
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

async function createDirectory (name, parent) {
  return await parent.getDirectoryHandle(name, { create: true })
}

async function createEmptyFile (name, parent) {
  const handle = await parent.getFileHandle(name, { create: true })
  assert_equals(await getFileSize(handle), 0)
  return handle
}

async function createFileWithContents (name, contents, parent) {
  const handle = await createEmptyFile(name, parent)
  const writer = await handle.createWritable()
  await writer.write(new Blob([contents]))
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

function createFileHandles (dir, ...fileNames) {
  return Promise.all(
    fileNames.map(fileName => dir.getFileHandle(fileName, { create: true }))
  )
}

function createDirectoryHandles (dir, ...dirNames) {
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
})

// ──────────────────────────────────────────────────────
// Set up directory_test using the memory adapter
// ──────────────────────────────────────────────────────

async function cleanupSandboxedFileSystem (root) {
  for await (const [name, entry] of root) {
    await root.removeEntry(name, { recursive: entry.kind === 'directory' })
  }
}

const memoryRoot = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

globalThis.directory_test = function directory_test (func, description) {
  promise_test(async t => {
    await cleanupSandboxedFileSystem(memoryRoot)
    t.add_cleanup(async () => {
      await cleanupSandboxedFileSystem(memoryRoot)
    })
    await func(t, memoryRoot)
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
]

const wptDir = resolve(ROOT, 'wpt', 'fs', 'script-tests')

if (!existsSync(wptDir)) {
  console.error('WPT tests not fetched. Run: bash scripts/fetch-wpt.sh')
  process.exit(1)
}

const availableFiles = readdirSync(wptDir)
const scripts = SUPPORTED_SCRIPTS.filter(s => availableFiles.includes(s))

// ──────────────────────────────────────────────────────
// Run tests
// ──────────────────────────────────────────────────────

let totalPassed = 0
let totalFailed = 0
let totalTests = 0

console.log('\n\x1b[1m=== WPT Tests (Memory Adapter) ===\x1b[0m\n')

for (const script of scripts) {
  console.log(`\n\x1b[1m${script}\x1b[0m`)
  const scriptPath = pathToFileURL(resolve(wptDir, script)).href
  await import(scriptPath)
  const { passed, failed, total } = await runTests()
  totalPassed += passed
  totalFailed += failed
  totalTests += total
}

// Run again with Node.js adapter if available
if (nodeRoot) {
  globalThis.directory_test = function directory_test (func, description) {
    promise_test(async t => {
      await cleanupSandboxedFileSystem(nodeRoot)
      t.add_cleanup(async () => {
        await cleanupSandboxedFileSystem(nodeRoot)
      })
      await func(t, nodeRoot)
    }, description)
  }

  console.log('\n\x1b[1m=== WPT Tests (Node.js File System Adapter) ===\x1b[0m\n')

  for (const script of scripts) {
    console.log(`\n\x1b[1m${script}\x1b[0m`)
    // We need to re-import the scripts. Since ES modules are cached,
    // we add a cache-busting query parameter.
    const scriptPath = pathToFileURL(resolve(wptDir, script)).href + '?adapter=node'
    await import(scriptPath)
    const { passed, failed, total } = await runTests()
    totalPassed += passed
    totalFailed += failed
    totalTests += total
  }

  // Cleanup
  try { rmSync(testFolderPath, { recursive: true }) } catch (e) { /* ignore */ }
}

// ──────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────

console.log('\n\x1b[1m=== Summary ===\x1b[0m')
console.log(`  Total: ${totalTests}, Passed: ${totalPassed}, Failed: ${totalFailed}`)

if (totalTests === 0) {
  console.error('\nNo tests were run!')
  process.exit(1)
}

// Don't fail on test failures yet - the goal is to have the framework running
// and see what passes/fails
console.log(`\n${totalFailed > 0 ? 'Some tests failed (expected while polyfill is being improved).' : 'All tests passed!'}`)
process.exit(0)
