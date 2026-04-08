/**
 * Tests for handle serialization / deserialization.
 *
 * Run with:  node test/test-serialize.js
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { getOriginPrivateDirectory, serialize, deserialize } from '../src/es6.js'
import * as nodeAdapter from '../src/adapters/node.js'
import * as memoryAdapter from '../src/adapters/memory.js'
import { FileSystemDirectoryHandle } from '../src/FileSystemDirectoryHandle.js'

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

await test('node: serialize() on a FileHandle returns object with adapter/kind/name/path', async () => {
  const fh = await nodeRoot.getFileHandle('hello.txt', { create: true })
  const data = serialize(fh)
  assert(typeof data === 'object', 'serialize() must return an object')
  assert(data.kind === 'file', `kind should be 'file', got '${data.kind}'`)
  assert(data.name === 'hello.txt', `name should be 'hello.txt', got '${data.name}'`)
  assert(typeof data.adapter === 'string' && data.adapter.includes(':FileHandle'),
    `adapter should include ':FileHandle', got '${data.adapter}'`)
  assert(typeof data.path === 'string' && data.path.endsWith('hello.txt'),
    `path should end with 'hello.txt', got '${data.path}'`)
})

await test('node: serialize() on a FolderHandle returns object with adapter/kind/name/path', async () => {
  const dh = await nodeRoot.getDirectoryHandle('subdir', { create: true })
  const data = serialize(dh)
  assert(typeof data === 'object', 'serialize() must return an object')
  assert(data.kind === 'directory', `kind should be 'directory', got '${data.kind}'`)
  assert(data.name === 'subdir', `name should be 'subdir', got '${data.name}'`)
  assert(typeof data.adapter === 'string' && data.adapter.includes(':FolderHandle'),
    `adapter should include ':FolderHandle', got '${data.adapter}'`)
  assert(typeof data.path === 'string' && data.path.endsWith('subdir'),
    `path should end with 'subdir', got '${data.path}'`)
})

await test('node: serialize() output is JSON-round-trippable', async () => {
  const fh = await nodeRoot.getFileHandle('roundtrip.txt', { create: true })
  const data = serialize(fh)
  const json = JSON.stringify(data)
  const parsed = JSON.parse(json)
  assert(parsed.kind === data.kind, 'kind survives JSON round-trip')
  assert(parsed.name === data.name, 'name survives JSON round-trip')
  assert(parsed.path === data.path, 'path survives JSON round-trip')
  assert(parsed.adapter === data.adapter, 'adapter survives JSON round-trip')
})

await test('node: deserialize() reconstructs a FileHandle (explicit adapter)', async () => {
  const fh = await nodeRoot.getFileHandle('deser-file.txt', { create: true })
  const writable = await fh.createWritable()
  await writable.write('hello from serialize test')
  await writable.close()

  const data = serialize(fh)
  const restored = await deserialize(data, nodeAdapter)

  assert(restored.kind === 'file', `restored handle should have kind 'file'`)
  assert(restored.name === 'deser-file.txt', `restored handle should have correct name`)
  const file = await restored.getFile()
  const text = await file.text()
  assert(text === 'hello from serialize test',
    `file contents should survive round-trip, got: '${text}'`)
})

await test('node: getOriginPrivateDirectory(serialized) reconstructs a FileHandle', async () => {
  const fh = await nodeRoot.getFileHandle('gopd-file.txt', { create: true })
  const writable = await fh.createWritable()
  await writable.write('via getOriginPrivateDirectory')
  await writable.close()

  const data = serialize(fh)
  const restored = await getOriginPrivateDirectory(data)

  assert(restored.kind === 'file', `restored handle should have kind 'file'`)
  assert(restored.name === 'gopd-file.txt', `restored handle should have correct name`)
  const file = await restored.getFile()
  const text = await file.text()
  assert(text === 'via getOriginPrivateDirectory',
    `file contents should be readable via restored handle, got: '${text}'`)
})

await test('node: getOriginPrivateDirectory(serialized) reconstructs a FolderHandle', async () => {
  const dh = await nodeRoot.getDirectoryHandle('gopd-dir', { create: true })
  await dh.getFileHandle('child.txt', { create: true })

  const data = serialize(dh)
  const restored = await getOriginPrivateDirectory(data)

  assert(restored.kind === 'directory', `restored should have kind 'directory'`)
  assert(restored.name === 'gopd-dir', `restored should have correct name`)
  const entries = []
  for await (const [name] of restored) entries.push(name)
  assert(entries.includes('child.txt'), `deserialized dir should list 'child.txt'`)
})

await test('node: deserialize() without explicit adapter uses data.adapter URL', async () => {
  const fh = await nodeRoot.getFileHandle('auto-adapter.txt', { create: true })
  const data = serialize(fh)
  const restored = await deserialize(data)
  assert(restored.kind === 'file', 'should restore as file handle')
  assert(restored.name === 'auto-adapter.txt', 'should have correct name')
})

await test('node: isSameEntry() is true for original and deserialized handle', async () => {
  const fh = await nodeRoot.getFileHandle('same-entry.txt', { create: true })
  const data = serialize(fh)
  const restored = await getOriginPrivateDirectory(data)
  assert(await fh.isSameEntry(restored), 'original and deserialized handle should be isSameEntry')
})

await test('node: isSameEntry() is true for original and deserialized directory handle', async () => {
  const dh = await nodeRoot.getDirectoryHandle('same-entry-dir', { create: true })
  const data = serialize(dh)
  const restored = await getOriginPrivateDirectory(data)
  assert(await dh.isSameEntry(restored), 'original and deserialized dir handle should be isSameEntry')
})

} finally {
  // Cleanup node test dir even if tests fail
  rmSync(testDir, { recursive: true })
}

// ---------------------------------------------------------------------------
// Memory adapter tests
// ---------------------------------------------------------------------------

const rawMemRoot = memoryAdapter.default()
const sharedRoot = new FileSystemDirectoryHandle(rawMemRoot)

await test('memory: serialize() on a FileHandle includes adapter/kind/name/file', async () => {
  const fh = await sharedRoot.getFileHandle('mem-file.txt', { create: true })
  const data = serialize(fh)
  assert(typeof data === 'object', 'serialize() must return an object')
  assert(data.kind === 'file', `kind should be 'file', got '${data.kind}'`)
  assert(data.name === 'mem-file.txt', `name should be 'mem-file.txt', got '${data.name}'`)
  assert(typeof data.adapter === 'string' && data.adapter.includes(':FileHandle'),
    `adapter should include ':FileHandle', got '${data.adapter}'`)
  assert(data.file instanceof File, 'file should be a File instance')
})

await test('memory: serialize() on a FolderHandle includes adapter/kind/name/root', async () => {
  const dh = await sharedRoot.getDirectoryHandle('mem-dir', { create: true })
  const data = serialize(dh)
  assert(data.kind === 'directory', `kind should be 'directory', got '${data.kind}'`)
  assert(data.name === 'mem-dir', `name should be 'mem-dir', got '${data.name}'`)
  assert(typeof data.adapter === 'string' && data.adapter.includes(':FolderHandle'),
    `adapter should include ':FolderHandle', got '${data.adapter}'`)
  assert(typeof data.root === 'object', 'root should be an object')
})

await test('memory: FolderHandle.serialize() includes full subtree', async () => {
  const dh = await sharedRoot.getDirectoryHandle('tree-dir', { create: true })
  const fh = await dh.getFileHandle('nested.txt', { create: true })
  const writable = await fh.createWritable()
  await writable.write('nested content')
  await writable.close()

  const data = serialize(dh)
  assert(data.root.children['nested.txt'] !== undefined, 'root should contain nested.txt')
  assert(data.root.children['nested.txt'].file instanceof File, 'nested entry should have a File')
})

await test('memory: deserialize() reconstructs a FileHandle (no root arg needed)', async () => {
  const fh = await sharedRoot.getFileHandle('to-restore.txt', { create: true })
  const writable = await fh.createWritable()
  await writable.write('in-memory content')
  await writable.close()

  const data = serialize(fh)
  const restored = await deserialize(data)

  assert(restored.kind === 'file', `restored handle should have kind 'file'`)
  assert(restored.name === 'to-restore.txt', `restored handle should have correct name`)
  const file = await restored.getFile()
  const text = await file.text()
  assert(text === 'in-memory content',
    `file contents should be visible via deserialized handle, got: '${text}'`)
})

await test('memory: deserialize() reconstructs a FolderHandle with full subtree', async () => {
  const dh = await sharedRoot.getDirectoryHandle('restore-dir', { create: true })
  const fh = await dh.getFileHandle('child.txt', { create: true })
  const writable = await fh.createWritable()
  await writable.write('child content')
  await writable.close()

  const data = serialize(dh)
  const restored = await deserialize(data)

  assert(restored.kind === 'directory', `restored should have kind 'directory'`)
  assert(restored.name === 'restore-dir', `restored should have correct name`)
  const entries = []
  for await (const [name, entry] of restored) {
    entries.push(name)
    if (name === 'child.txt') {
      const text = await (await entry.getFile()).text()
      assert(text === 'child content', `child file content should be preserved, got: '${text}'`)
    }
  }
  assert(entries.includes('child.txt'), `deserialized dir should list 'child.txt'`)
})

await test('memory: getOriginPrivateDirectory(serialized) reconstructs a FolderHandle', async () => {
  const dh = await sharedRoot.getDirectoryHandle('gopd-mem-dir', { create: true })
  await dh.getFileHandle('item.txt', { create: true })

  const data = serialize(dh)
  const restored = await getOriginPrivateDirectory(data)

  assert(restored.kind === 'directory', `restored should have kind 'directory'`)
  assert(restored.name === 'gopd-mem-dir', `restored should have correct name`)
  const entries = []
  for await (const [name] of restored) entries.push(name)
  assert(entries.includes('item.txt'), `deserialized dir should list 'item.txt'`)
})

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

await test('serialize() throws NotSupportedError for adapters without serialize()', async () => {
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
    serialize(handle)
  } catch (err) {
    threw = true
    assert(err instanceof DOMException, 'should throw DOMException')
    assert(err.name === 'NotSupportedError', `should throw NotSupportedError, got '${err.name}'`)
  }
  assert(threw, 'should have thrown')
})

await test('deserialize() throws TypeError when no adapter info available', async () => {
  let threw = false
  try {
    await deserialize({ kind: 'file', name: 'x.txt' })
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
