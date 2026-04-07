/**
 * Tests for handle serialization / deserialization.
 *
 * Run with:  node test/test-serialize.js
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { getOriginPrivateDirectory, deserialize } from '../src/es6.js'
import * as nodeAdapter from '../src/adapters/node.js'
import * as memoryAdapter from '../src/adapters/memory.js'

let failures = 0

function assert (condition, msg = 'Assertion failed') {
  if (!condition) {
    throw new Error(msg)
  }
}

async function test (desc, fn) {
  try {
    await fn()
    console.log(`[OK]  ${desc}`)
  } catch (err) {
    console.error(`[ERR] ${desc}\n      ${err.message}`)
    console.error(err.stack)
    failures++
  }
}

// ---------------------------------------------------------------------------
// Node adapter tests
// ---------------------------------------------------------------------------

const testDir = './tmp-test-serialize'

if (!existsSync(testDir)) mkdirSync(testDir)

const nodeRoot = await getOriginPrivateDirectory(nodeAdapter, testDir)

try {

await test('node: serialize() on a FileHandle returns a plain object with kind/name/path', async () => {
  const fh = await nodeRoot.getFileHandle('hello.txt', { create: true })
  const data = fh.serialize()
  assert(typeof data === 'object', 'serialize() must return an object')
  assert(data.kind === 'file', `kind should be 'file', got '${data.kind}'`)
  assert(data.name === 'hello.txt', `name should be 'hello.txt', got '${data.name}'`)
  assert(typeof data.path === 'string' && data.path.endsWith('hello.txt'), `path should end with 'hello.txt', got '${data.path}'`)
})

await test('node: serialize() on a FolderHandle returns a plain object with kind/name/path', async () => {
  const dh = await nodeRoot.getDirectoryHandle('subdir', { create: true })
  const data = dh.serialize()
  assert(typeof data === 'object', 'serialize() must return an object')
  assert(data.kind === 'directory', `kind should be 'directory', got '${data.kind}'`)
  assert(data.name === 'subdir', `name should be 'subdir', got '${data.name}'`)
  assert(typeof data.path === 'string' && data.path.endsWith('subdir'), `path should end with 'subdir', got '${data.path}'`)
})

await test('node: serialize() output is JSON-round-trippable', async () => {
  const fh = await nodeRoot.getFileHandle('roundtrip.txt', { create: true })
  const data = fh.serialize()
  const json = JSON.stringify(data)
  const parsed = JSON.parse(json)
  assert(parsed.kind === data.kind, 'kind survives JSON round-trip')
  assert(parsed.name === data.name, 'name survives JSON round-trip')
  assert(parsed.path === data.path, 'path survives JSON round-trip')
})

await test('node: deserialize() reconstructs a FileHandle and can read/write the file', async () => {
  const fh = await nodeRoot.getFileHandle('deser-file.txt', { create: true })
  const writable = await fh.createWritable()
  await writable.write('hello from serialize test')
  await writable.close()

  const data = fh.serialize()
  const restored = await deserialize(data, nodeAdapter)

  assert(restored.kind === 'file', `restored handle should have kind 'file'`)
  assert(restored.name === 'deser-file.txt', `restored handle should have correct name`)

  const file = await restored.getFile()
  const text = await file.text()
  assert(text === 'hello from serialize test', `file contents should survive round-trip, got: '${text}'`)
})

await test('node: deserialize() reconstructs a FolderHandle and can list entries', async () => {
  const dh = await nodeRoot.getDirectoryHandle('deser-dir', { create: true })
  await dh.getFileHandle('child.txt', { create: true })

  const data = dh.serialize()
  const restored = await deserialize(data, nodeAdapter)

  assert(restored.kind === 'directory', `restored handle should have kind 'directory'`)
  assert(restored.name === 'deser-dir', `restored handle should have correct name`)

  const entries = []
  for await (const [name] of restored) {
    entries.push(name)
  }
  assert(entries.includes('child.txt'), `deserialized dir should list 'child.txt'`)
})

await test('node: isSameEntry() is true for original and deserialized handle', async () => {
  const fh = await nodeRoot.getFileHandle('same-entry.txt', { create: true })
  const data = fh.serialize()
  const restored = await deserialize(data, nodeAdapter)
  assert(await fh.isSameEntry(restored), 'original and deserialized handle should be isSameEntry')
})

await test('node: isSameEntry() is true for original and deserialized directory handle', async () => {
  const dh = await nodeRoot.getDirectoryHandle('same-entry-dir', { create: true })
  const data = dh.serialize()
  const restored = await deserialize(data, nodeAdapter)
  assert(await dh.isSameEntry(restored), 'original and deserialized dir handle should be isSameEntry')
})

await test('node: deserialize() accepts a dynamic import() Promise', async () => {
  const fh = await nodeRoot.getFileHandle('dynamic-import.txt', { create: true })
  const data = fh.serialize()
  // Pass the Promise returned by import() directly, as a convenience shorthand
  const restored = await deserialize(data, import('../src/adapters/node.js'))
  assert(restored.kind === 'file', 'handle kind should be file')
  assert(restored.name === 'dynamic-import.txt', 'handle name should match')
})

} finally {
  // Cleanup node test dir even if tests fail
  rmSync(testDir, { recursive: true })
}

// ---------------------------------------------------------------------------
// Memory adapter tests
// ---------------------------------------------------------------------------

const memRoot = await getOriginPrivateDirectory(memoryAdapter)

// The memory adapter's deserialize needs the raw (unwrapped) FolderHandle.
// We obtain it by calling the default export directly.
const rawMemRoot = memoryAdapter.default()

// Rebuild the same tree under the raw root so that deserialization can navigate it.
// For these tests we build under `memRoot` (the wrapped handle) and mirror
// the raw root via the adapter's internal FolderHandle.
//
// A simpler approach: just use rawMemRoot as the backing of a separate
// FileSystemDirectoryHandle so that the wrapped handle and the raw root share
// the same object graph.
import { FileSystemDirectoryHandle } from '../src/FileSystemDirectoryHandle.js'
const sharedRoot = new FileSystemDirectoryHandle(rawMemRoot)

await test('memory: serialize() on a FileHandle returns a plain object with kind/name/path', async () => {
  const fh = await sharedRoot.getFileHandle('mem-file.txt', { create: true })
  const data = fh.serialize()
  assert(typeof data === 'object', 'serialize() must return an object')
  assert(data.kind === 'file', `kind should be 'file', got '${data.kind}'`)
  assert(data.name === 'mem-file.txt', `name should be 'mem-file.txt', got '${data.name}'`)
  assert(data.path === '/mem-file.txt', `path should be '/mem-file.txt', got '${data.path}'`)
})

await test('memory: serialize() on a FolderHandle returns a plain object with kind/name/path', async () => {
  const dh = await sharedRoot.getDirectoryHandle('mem-dir', { create: true })
  const data = dh.serialize()
  assert(data.kind === 'directory', `kind should be 'directory', got '${data.kind}'`)
  assert(data.name === 'mem-dir', `name should be 'mem-dir', got '${data.name}'`)
  assert(data.path === '/mem-dir', `path should be '/mem-dir', got '${data.path}'`)
})

await test('memory: serialize() on a nested FileHandle has correct path', async () => {
  const dh = await sharedRoot.getDirectoryHandle('nested', { create: true })
  const fh = await dh.getFileHandle('deep.txt', { create: true })
  const data = fh.serialize()
  assert(data.path === '/nested/deep.txt', `path should be '/nested/deep.txt', got '${data.path}'`)
})

await test('memory: deserialize() reconstructs a FileHandle within the same session', async () => {
  const fh = await sharedRoot.getFileHandle('to-restore.txt', { create: true })
  const writable = await fh.createWritable()
  await writable.write('in-memory content')
  await writable.close()

  const data = fh.serialize()
  const restored = await deserialize(data, memoryAdapter, rawMemRoot)

  assert(restored.kind === 'file', `restored handle should have kind 'file'`)
  assert(restored.name === 'to-restore.txt', `restored handle should have correct name`)
  const file = await restored.getFile()
  const text = await file.text()
  assert(text === 'in-memory content', `file contents should be visible via deserialized handle, got: '${text}'`)
})

await test('memory: deserialize() reconstructs a FolderHandle within the same session', async () => {
  const dh = await sharedRoot.getDirectoryHandle('restore-dir', { create: true })
  await dh.getFileHandle('child.txt', { create: true })

  const data = dh.serialize()
  const restored = await deserialize(data, memoryAdapter, rawMemRoot)

  assert(restored.kind === 'directory', `restored handle should have kind 'directory'`)
  assert(restored.name === 'restore-dir', `restored handle should have correct name`)
  const entries = []
  for await (const [name] of restored) entries.push(name)
  assert(entries.includes('child.txt'), `deserialized dir should list 'child.txt'`)
})

await test('memory: isSameEntry() is true for original and deserialized handle', async () => {
  const fh = await sharedRoot.getFileHandle('same-entry-mem.txt', { create: true })
  const data = fh.serialize()
  const restored = await deserialize(data, memoryAdapter, rawMemRoot)
  assert(await fh.isSameEntry(restored), 'original and deserialized memory file handle should be isSameEntry')
})

await test('memory: writes to deserialized handle are visible through the original handle', async () => {
  const fh = await sharedRoot.getFileHandle('write-through.txt', { create: true })
  const data = fh.serialize()
  const restored = await deserialize(data, memoryAdapter, rawMemRoot)

  // Write via the deserialized (restored) handle
  const writable = await restored.createWritable()
  await writable.write('written via restored handle')
  await writable.close()

  // Read back via the original handle — both point at the same in-memory entry
  const file = await fh.getFile()
  const text = await file.text()
  assert(text === 'written via restored handle',
    `writes through deserialized handle should be visible via original handle, got: '${text}'`)
})

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

await test('serialize() throws NotSupportedError for adapters without serialize()', async () => {
  // Manually wrap a fake adapter that has no serialize()
  const { FileSystemFileHandle } = await import('../src/FileSystemFileHandle.js')
  const fakeAdapter = {
    kind: 'file',
    name: 'fake.txt',
    writable: false,
    async getFile () { return new File([], 'fake.txt') },
    async createWritable () { throw new Error('no') },
    async isSameEntry () { return false },
    async remove () {}
  }
  const handle = new FileSystemFileHandle(fakeAdapter)
  let threw = false
  try {
    handle.serialize()
  } catch (err) {
    threw = true
    assert(err instanceof DOMException, 'should throw DOMException')
    assert(err.name === 'NotSupportedError', `should throw NotSupportedError, got '${err.name}'`)
  }
  assert(threw, 'should have thrown')
})

await test('deserialize() throws TypeError for adapter modules without deserialize()', async () => {
  // A module object that has no deserialize export
  const fakeModule = {}
  let threw = false
  try {
    await deserialize({ kind: 'file', name: 'x.txt', path: '/x.txt' }, fakeModule)
  } catch (err) {
    threw = true
    assert(err instanceof TypeError, 'should throw TypeError')
  }
  assert(threw, 'should have thrown')
})

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`)
  process.exit(1)
} else {
  console.log('\nAll serialization tests passed.')
}
