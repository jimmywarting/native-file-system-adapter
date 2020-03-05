// @ts-check
import { WritableStream, ReadableStream as Readable } from 'https://cdn.jsdelivr.net/npm/web-streams-polyfill@2.1.0/dist/ponyfill.es2018.mjs'
import {
  chooseFileSystemEntries,
  FileSystemDirectoryHandle
} from '../src/es6.js'

FileSystemDirectoryHandle.getSystemDirectory({
  type: 'sandbox'
}).then(handle => {
  handle.getFile('ss').then(r => {
    r.createWritable().then(r => {
      r.getWriter
    })
  })
})

const Writable = globalThis.WritableStream || WritableStream
const ReadableStream = globalThis.WritableStream
  ? globalThis.ReadableStream
  : Readable

globalThis.chooseFileSystemEntries = chooseFileSystemEntries

if (!Blob.prototype.text) {
  Blob.prototype.text = function () {
    return new Response(this).text()
  }
  Blob.prototype.arrayBuffer = function () {
    return new Response(this).arrayBuffer()
  }
  Blob.prototype.stream = function () {
    return new Response(this).body
  }
}

let err, handle, existing_handle, file_handle, subdir, wfs, file_name, body, rs, dir
const tests = []
const tBody = table.tBodies[0]
const cells = tBody.querySelectorAll('tr td:not(:first-child)')
function t(n, fn) {
  tests.push(fn)
  const tr = tBody.insertRow()
  const td = tr.insertCell()
  td.innerText = n
  tr.insertCell()
  tr.insertCell()
  tr.insertCell()
  tr.insertCell()
}
function assert(r) {
  if (!r) throw new Error('Assertion failed')
}

function tt (n, html) {
  const tr = manualTest.tBodies[0].insertRow()
  tr.insertCell().innerText = n
  tr.insertCell().appendChild(html())
}

t('getDirectory(create=false) rejects for non-existing directories', async (root) => {
  err = await root.getDirectory('non-existing-dir').catch(a=>a)
  assert(err instanceof DOMException)
  assert(err.name === 'NotFoundError')
})

t('getDirectory(create=true) creates an empty directory', async (root) => {
  handle = await root.getDirectory('non-existing-dir', { create: true })
  assert(handle.isFile === false)
  assert(handle.isDirectory === true)
  assert(handle.name === 'non-existing-dir')
  assert(await getDirectoryEntryCount(handle) === 0)
  arrayEqual(await getSortedDirectoryEntries(root), ['non-existing-dir/'])
})

t('getDirectory(create=false) returns existing directories', async (root) => {
  existing_handle = await root.getDirectory('dir-with-contents', { create: true })
  file_handle = await createEmptyFile('test-file', existing_handle)
  handle = await root.getDirectory('dir-with-contents', { create: false })
  assert(handle.isFile === false)
  assert(handle.isDirectory === true)
  assert(handle.name === 'dir-with-contents')
  arrayEqual(await getSortedDirectoryEntries(handle), ['test-file'])
})

t('getDirectory(create=true) returns existing directories without erasing', async (root) => {
  existing_handle = await root.getDirectory('dir-with-contents', { create: true })
  file_handle = await existing_handle.getFile('test-file', { create: true })
  handle = await root.getDirectory('dir-with-contents', { create: true })
  assert(handle.isFile === false)
  assert(handle.isDirectory === true)
  assert(handle.name === 'dir-with-contents')
  arrayEqual(await getSortedDirectoryEntries(handle), ['test-file'])
})

t('getDirectory() when a file already exists with the same name', async (root) => {
  await createEmptyFile('file-name', root)
  err = await root.getDirectory('file-name').catch(e=>e)
  assert(err.name === 'TypeMismatchError')
  err = await root.getDirectory('file-name', { create: false }).catch(e=>e)
  assert(err.name === 'TypeMismatchError')
  err = await root.getDirectory('file-name', {create: true}).catch(e=>e)
})

t('getDirectory() with empty name', async (root) => {
  err = await root.getDirectory('', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getDirectory('', {create: false}).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getDirectory(create=true) with empty name', async (root) => {
  err = await root.getDirectory('.').catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getDirectory('.', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getDirectory() with ".." name', async (root) => {
  subdir = await createDirectory('subdir-name', root)
  err = await subdir.getDirectory('..').catch(e=>e)
  assert(err instanceof TypeError)
  err = await subdir.getDirectory('..', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getDirectory(create=false) with a path separator when the directory exists', async (root) => {
  const first_subdir_name = 'first-subdir-name'
  const first_subdir = await createDirectory(first_subdir_name, root)
  const second_subdir_name = 'second-subdir-name'
  await createDirectory(second_subdir_name, first_subdir)
  const path_with_separator = `${first_subdir_name}/${second_subdir_name}`
  err = await root.getDirectory(path_with_separator).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getDirectory(create=true) with a path separator', async (root) => {
  const subdir_name = 'subdir-name';
  const subdir = await createDirectory(subdir_name, root);
  const path_with_separator = `${subdir_name}/file_name`;
  err = await root.getDirectory(path_with_separator, { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFile(create=false) rejects for non-existing files', async (root) => {
  err = await root.getFile('non-existing-file').catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('getFile(create=true) creates an empty file for non-existing files', async (root) => {
  handle = await root.getFile('non-existing-file', { create: true })
  assert(handle.isFile === true)
  assert(handle.isDirectory === false)
  assert(handle.name === 'non-existing-file')
  assert(await getFileSize(handle) === 0)
  assert(await getFileContents(handle) === '')
})

t('getFile(create=false) returns existing files', async (root) => {
  existing_handle = await createFileWithContents('existing-file', '1234567890', root)
  handle = await root.getFile('existing-file')
  assert(handle.isFile === true)
  assert(handle.isDirectory === false)
  assert(handle.name === 'existing-file')
  assert(await getFileSize(handle) === 10)
  assert(await getFileContents(handle) === '1234567890')
})

t('getFile(create=true) returns existing files without erasing', async (root) => {
  existing_handle = await createFileWithContents('file-with-contents', '1234567890', root)
  handle = await root.getFile('file-with-contents', { create: true })
  assert(handle.isFile === true)
  assert(handle.isDirectory === false)
  assert(handle.name === 'file-with-contents')
  assert(await getFileSize(handle) === 10)
  assert(await getFileContents(handle) === '1234567890')
})

t('getFile(create=false) when a directory already exists with the same name', async (root) => {
  await root.getDirectory('dir-name', { create: true })
  err = await root.getFile('dir-name').catch(e=>e)
  assert(err.name === 'TypeMismatchError')
})

t('getFile(create=true) when a directory already exists with the same name', async (root) => {
  await root.getDirectory('dir-name', { create: true })
  err = await root.getFile('dir-name', { create: true }).catch(e=>e)
  assert(err.name === 'TypeMismatchError')
})

t('getFile() with empty name', async (root) => {
  err = await root.getFile('', {create: true}).catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getFile('', {create: false}).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFile() with "." name', async (root) => {
  err = await root.getFile('.').catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getFile('.', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFile() with ".." name', async (root) => {
  err = await root.getFile('..').catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getFile('..', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFile(create=false) with a path separator when the file exists.', async (root) => {
  await createDirectory('subdir-name', root)
  err = await root.getFile(`subdir-name/file_name`).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFile(create=true) with a path separator', async (root) => {
  await createDirectory('subdir-name', root)
  err = await root.getFile(`subdir-name/file_name`, {create: true}).catch(e=>e)
  assert(err instanceof TypeError)
})

t('removeEntry() to remove a file', async (root) => {
  handle = await createFileWithContents('file-to-remove', '12345', root)
  await createFileWithContents('file-to-keep', 'abc', root)
  await root.removeEntry('file-to-remove')
  arrayEqual(await getSortedDirectoryEntries(root), ['file-to-keep'])
  err = await getFileContents(handle).catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('removeEntry() on an already removed file should fail', async (root) => {
  handle = await createFileWithContents('file-to-remove', '12345', root)
  await root.removeEntry('file-to-remove')
  err = await root.removeEntry('file-to-remove').catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('removeEntry() to remove an empty directory', async (root) => {
  handle = await root.getDirectory('dir-to-remove', { create: true })
  await createFileWithContents('file-to-keep', 'abc', root)
  await root.removeEntry('dir-to-remove')
  arrayEqual(await getSortedDirectoryEntries(root), ['file-to-keep'])
  err = await getSortedDirectoryEntries(handle).catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('removeEntry() on a non-empty directory should fail', async (root) => {
  handle = await root.getDirectory('dir-to-remove', { create: true })
  await createEmptyFile('file-in-dir', handle)
  err = await root.removeEntry('dir-to-remove').catch(e=>e)
  assert(err.name === 'InvalidModificationError')
  arrayEqual(await getSortedDirectoryEntries(root), ['dir-to-remove/'])
  arrayEqual(await getSortedDirectoryEntries(handle), ['file-in-dir']);
})

t('removeEntry() with empty name should fail', async (root) => {
  handle = await createDirectory('dir', root)
  err = await handle.removeEntry('').catch(e=>e)
  assert(err instanceof TypeError)
})

t('removeEntry() with "." name should fail', async (root) => {
  handle = await createDirectory('dir', root)
  err = await handle.removeEntry('.').catch(e=>e)
  assert(err instanceof TypeError)
})

t('removeEntry() with ".." name should fail', async (root) => {
  handle = await createDirectory('dir', root)
  err = await handle.removeEntry('..').catch(e=>e)
  assert(err instanceof TypeError)
})

t('removeEntry() with a path separator should fail.', async (root) => {
  dir = await createDirectory('dir-name', root)
  await createEmptyFile('file-name', dir)
  err = await root.removeEntry(`dir-name/file-name`).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFile() provides a file that can be sliced', async (root) => {
  const fileContents = 'awesome content'
  handle = await createFileWithContents('foo.txt', fileContents, root)
  let file = await handle.getFile()
  let slice = file.slice(1, file.size)
  let actualContents = await slice.text()
  assert(actualContents === fileContents.slice(1, fileContents.length))
})

t('getFile() returns last modified time', async (root) => {
  handle = await createEmptyFile('mtime.txt', root)
  const first_mtime = (await handle.getFile()).lastModified
  wfs = await handle.createWritable({ keepExistingData: false })
  await wfs.write('foo')
  await wfs.close()
  const second_mtime = (await handle.getFile()).lastModified
  let fileReplica = await handle.getFile()
  assert(second_mtime === fileReplica.lastModified)
  assert(first_mtime < second_mtime)
})

t('can be piped to with a string', async (root) => {
  handle = await createEmptyFile('foo_string.txt', root)
  wfs = await handle.createWritable()
  rs = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue('foo_string')
      ctrl.close()
    }
  })
  await rs.pipeTo(wfs, { preventCancel: true })
  assert(await getFileContents(handle) === 'foo_string')
  assert(await getFileSize(handle) === 10)
})

t('can be piped to with an ArrayBuffer', async (root) => {
  handle = await createEmptyFile('foo_arraybuf.txt', root)
  wfs = await handle.createWritable()
  rs = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([102, 111, 111]).buffer);
      controller.close();
    }
  })
  await rs.pipeTo(wfs, { preventCancel: true })
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
})

t('can be piped to with a Blob', async (root) => {
  handle = await createEmptyFile('foo_arraybuf.txt', root)
  wfs = await handle.createWritable()
  rs = new ReadableStream({
    start(controller) {
      controller.enqueue(new Blob(['foo']))
      controller.close()
    }
  })
  await rs.pipeTo(wfs, { preventCancel: true })
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
})

t('can be piped to with a param object with write command', async (root) => {
  handle = await createEmptyFile('foo_write_param.txt', root)
  wfs = await handle.createWritable()
  rs = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'write', data: 'foobar' })
      controller.close()
    }
  })
  await rs.pipeTo(wfs, { preventCancel: true });
  assert(await getFileContents(handle) === 'foobar')
  assert(await getFileSize(handle) === 6)
})

t('can be piped to with a param object with multiple commands', async (root) => {
  handle = await createEmptyFile('foo_write_param.txt', root)
  wfs = await handle.createWritable()
  rs = new ReadableStream({
    async start(controller) {
      controller.enqueue({type: 'write', data: 'foobar'})
      controller.enqueue({type: 'truncate', size: 10})
      controller.enqueue({type: 'write', position: 0, data: 'baz'})
      controller.close()
    }
  })
  await rs.pipeTo(wfs)
  assert(await getFileContents(handle) === 'bazbar\0\0\0\0')
  assert(await getFileSize(handle) === 10)
})

t('multiple operations can be queued', async (root) => {
  handle = await createEmptyFile('foo_write_queued.txt', root)
  wfs = await handle.createWritable();
  rs = new ReadableStream({
    start(controller) {
      controller.enqueue('foo')
      controller.enqueue('bar')
      controller.enqueue('baz')
      controller.close()
    }
  })
  await rs.pipeTo(wfs, { preventCancel: true })
  assert(await getFileContents(handle) === 'foobarbaz')
  assert(await getFileSize(handle) === 9)
})

t('plays well with fetch', async (root) => {
  handle = await createEmptyFile('fetched.txt', root)
  wfs = await handle.createWritable()
  body = streamFromFetch('fetched from far')
  await body.pipeTo(wfs, { preventCancel: true })
  assert(await getFileContents(handle) === 'fetched from far')
  assert(await getFileSize(handle) === 16)
})

t('abort() aborts write', async (root) => {
  handle = await createEmptyFile('aborted should_be_empty.txt', root)
  wfs = await handle.createWritable()
  body = streamFromFetch('fetched from far')
  const abortController = new AbortController()
  const signal = abortController.signal
  await abortController.abort()
  const promise = body.pipeTo(wfs, { signal })
  err = await promise.catch(e=>e)
  assert(err.name === 'AbortError')
  err = await wfs.close().catch(e=>e)
  assert(err instanceof TypeError)
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() with an empty blob to an empty file', async (root) => {
  handle = await createEmptyFile('empty_blob', root)
  wfs = await handle.createWritable()
  await wfs.write(new Blob([]))
  await wfs.close()
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() a blob to an empty file', async (root) => {
  handle = await createEmptyFile('valid_blob', root);
  wfs = await handle.createWritable();
  await wfs.write(new Blob(['1234567890']))
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() with WriteParams without position to an empty file', async (root) => {
  handle = await createEmptyFile('write_param_empty', root)
  wfs = await handle.createWritable();
  await wfs.write({type: 'write', data: '1234567890'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() with WriteParams without position to an empty file', async (root) => {
  handle = await createEmptyFile('write_param_empty', root)
  wfs = await handle.createWritable()
  await wfs.write({type: 'write', data: '1234567890'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() a string to an empty file with zero offset', async (root) => {
  handle = await createEmptyFile('string_zero_offset', root)
  wfs = await handle.createWritable()
  await wfs.write({type: 'write', position: 0, data: '1234567890'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() a blob to an empty file with zero offset', async (root) => {
  handle = await createEmptyFile('blob_zero_offset', root)
  wfs = await handle.createWritable()
  await wfs.write({ type: 'write', position: 0, data: new Blob(['1234567890']) })
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() called consecutively appends', async (root) => {
  handle = await createEmptyFile('write_appends', root)
  wfs = await handle.createWritable()
  await wfs.write('12345')
  await wfs.write('67890')
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() WriteParams without position and string appends', async (root) => {
  handle = await createEmptyFile('write_appends_object_string', root)
  wfs = await handle.createWritable()
  await wfs.write('12345')
  await wfs.write({type: 'write', data: '67890'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() WriteParams without position and blob appends', async (root) => {
  handle = await createEmptyFile('write_appends_object_blob', root)
  wfs = await handle.createWritable()
  await wfs.write('12345')
  await wfs.write({type: 'write', data: new Blob(['67890'])})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() called with a string and a valid offset', async (root) => {
  handle = await createEmptyFile('string_with_offset', root)
  wfs = await handle.createWritable()
  await wfs.write('1234567890')
  await wfs.write({type: 'write', position: 4, data: 'abc'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234abc890')
  assert(await getFileSize(handle) === 10)
})

t('write() called with a blob and a valid offset', async (root) => {
  handle = await createEmptyFile('blob_with_offset', root)
  wfs = await handle.createWritable()
  await wfs.write('1234567890')
  await wfs.write({type: 'write', position: 4, data: new Blob(['abc'])})
  await wfs.close()
  assert(await getFileContents(handle) === '1234abc890')
  assert(await getFileSize(handle) === 10)
})

t('write() called with an invalid offset', async (root) => {
  handle = await createEmptyFile('bad_offset', root)
  wfs = await handle.createWritable()
  err = await wfs.write({ type: 'write', position: 4, data: new Blob(['abc']) }).catch(e=>e)
  assert(err.name === 'InvalidStateError')
  err = await wfs.close().catch(e=>e)
  assert(err instanceof TypeError)
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() with an empty string to an empty file', async (root) => {
  handle = await createEmptyFile('empty_string', root)
  wfs = await handle.createWritable()
  await wfs.write('')
  await wfs.close()
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() with a valid utf-8 string', async (root) => {
  handle = await createEmptyFile('valid_utf8_string', root)
  wfs = await handle.createWritable()
  await wfs.write('foo🤘')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo🤘')
  assert(await getFileSize(handle) === 7)
})

t('write() with a string with unix line ending preserved', async (root) => {
  handle = await createEmptyFile('string_with_unix_line_ending', root)
  wfs = await handle.createWritable()
  await wfs.write('foo\n')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo\n')
  assert(await getFileSize(handle) === 4)
},
async () => {
  'write() with a string with windows line ending preserved'
  handle = await createEmptyFile('string_with_windows_line_ending', root)
  wfs = await handle.createWritable()
  await wfs.write('foo\r\n')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo\r\n')
  assert(await getFileSize(handle) === 5)
})

t('write() with an empty array buffer to an empty file', async (root) => {
  handle = await createEmptyFile('empty_array_buffer', root)
  wfs = await handle.createWritable()
  await wfs.write(new ArrayBuffer(0))
  await wfs.close()
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() with a valid typed array buffer', async (root) => {
  handle = await createEmptyFile('valid_string_typed_byte_array', root)
  wfs = await handle.createWritable()
  const buf = new Uint8Array([102, 111, 111]).buffer
  await wfs.write(buf)
  await wfs.close()
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
})

t('atomic writes: close() fails when parent directory is removed', async (root) => {
  dir = await createDirectory('parent_dir', root)
  file_name = 'close_fails_when_dir_removed.txt'
  handle = await createEmptyFile(file_name, dir)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  await root.removeEntry('parent_dir', { recursive: true })
  err = await wfs.close().catch(e=>e)
  console.log(err)
  assert(err.name === 'NotFoundError')
})

t('atomic writes: writable file streams make atomic changes on close', async (root) => {
  handle = await createEmptyFile('atomic_writes.txt', root)
  wfs = await handle.createWritable()
  await wfs.write('foox')
  const wfs2 = await handle.createWritable()
  await wfs2.write('bar')
  assert(await getFileSize(handle) === 0)
  await wfs2.close()
  assert(await getFileContents(handle) === 'bar')
  assert(await getFileSize(handle) === 3)
  await wfs.close()
  assert(await getFileContents(handle) === 'foox')
  assert(await getFileSize(handle) === 4)
})
// async () => {
//   // 'atomic writes: writable file stream persists file on close, even if file is removed'
//   dir = await createDirectory('parent_dir', root)
//   file_name = 'atomic_writable_file_stream_persists_removed.txt'
//   handle = await createFileWithContents(file_name, 'foo', dir)
//   wfs = await handle.createWritable()
//   await wfs.write('bar')
//   await dir.removeEntry(file_name)
//   err = await getFileContents(handle).catch(e=>e)
//   assert(err.name === 'NotFoundError')
//   await wfs.close()
//   assert(await getFileContents(handle) === 'bar')
// })


t('atomic writes: write() after close() fails', async (root) => {
  handle = await createEmptyFile('atomic_write_after_close.txt', root)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
  err = await wfs.write('abc').catch(e=>e)
  assert(err instanceof TypeError)
})

t('atomic writes: truncate() after close() fails', async (root) => {
  handle = await createEmptyFile('atomic_truncate_after_close.txt', root)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
  err = await wfs.truncate(0).catch(e=>e)
  assert(err instanceof TypeError)
})

t('atomic writes: close() after close() fails', async (root) => {
  handle = await createEmptyFile('atomic_close_after_close.txt', root)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
  err = await wfs.close().catch(e=>e)
  assert(err instanceof TypeError)
})

t('atomic writes: only one close() operation may succeed', async (root) => {
  handle = await createEmptyFile('there_can_be_only_one.txt', root)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  // This test might be flaky if there is a race condition allowing
  // close() to be called multiple times.
  const success_promises = [...Array(100)].map(() => wfs.close().then(() => 1).catch(() => 0))
  const close_attempts = await Promise.all(success_promises)
  const success_count = close_attempts.reduce((x, y) => x + y)
  assert(success_count === 1)
})

t('getWriter() can be used', async (root) => {
  handle = await createEmptyFile('writer_written', root)
  wfs = await handle.createWritable()
  const writer = wfs.getWriter()
  await writer.write('foo')
  await writer.write(new Blob(['bar']))
  await writer.write({ type: 'seek', position: 0 })
  await writer.write({ type: 'write', data: 'baz' })
  await writer.close()
  assert(await getFileContents(handle) === 'bazbar')
  assert(await getFileSize(handle) === 6)
})

t('writing small bits advances the position', async (root) => {
  handle = await createEmptyFile('writer_written', root)
  wfs = await handle.createWritable()
  const writer = wfs.getWriter()
  await writer.write('foo')
  await writer.write(new Blob(['bar']))
  await writer.write({ type: 'seek', position: 0 })
  await writer.write({ type: 'write', data: 'b' })
  await writer.write({ type: 'write', data: 'a' })
  await writer.write({ type: 'write', data: 'z' })
  await writer.close()
  assert(await getFileContents(handle) === 'bazbar')
  assert(await getFileSize(handle) === 6)
})

t('WriteParams: truncate missing size param', async (root) => {
  handle = await createFileWithContents('content.txt', 'very long string', root)
  wfs = await handle.createWritable()
  err = await wfs.write({ type: 'truncate' }).catch(e=>e)
  assert(err.name === 'SyntaxError')
})

t('WriteParams: write missing data param', async (root) => {
  handle = await createEmptyFile('content.txt', root)
  wfs = await handle.createWritable()
  err = await wfs.write({ type: 'write' }).catch(e=>e)
  assert(err.name === 'SyntaxError')
})

t('WriteParams: seek missing position param', async (root) => {
  handle = await createFileWithContents('content.txt', 'seekable', root)
  wfs = await handle.createWritable()
  err = await wfs.write({ type: 'seek' }).catch(e=>e)
  assert(err.name === 'SyntaxError')
})

t('truncate() to shrink a file', async (root) => {
  handle = await createEmptyFile('trunc_shrink', root)
  wfs = await handle.createWritable()
  await wfs.write('1234567890')
  await wfs.truncate(5)
  await wfs.close()
  assert(await getFileContents(handle) === '12345')
  assert(await getFileSize(handle) === 5)
})

t('truncate() to grow a file', async (root) => {
  handle = await createEmptyFile('trunc_grow', root)
  wfs = await handle.createWritable()
  await wfs.write('abc')
  await wfs.truncate(5)
  await wfs.close()
  assert(await getFileContents(handle) === 'abc\0\0')
  assert(await getFileSize(handle) === 5)
})

t('createWritable() fails when parent directory is removed', async (root) => {
  dir = await createDirectory('parent_dir', root)
  handle = await createEmptyFile('create_writable_fails_when_dir_removed.txt', dir)
  await root.removeEntry('parent_dir', { recursive: true })
  err = await handle.createWritable().catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('write() fails when parent directory is removed', async (root) => {
  // TODO: fix me
  // dir = await createDirectory('parent_dir', root)
  // handle = await createEmptyFile('write_fails_when_dir_removed.txt', dir)
  // wfs = await handle.createWritable()
  // await root.removeEntry('parent_dir', { recursive: true })
  // err = await wfs.write('foo').catch(e=>e)
  // assert(err?.name === 'NotFoundError', 'write() fails when parent directory is removed')
})

t('truncate() fails when parent directory is removed', async (root) => {
  // TODO: fix me
  // dir = await createDirectory('parent_dir', root)
  // file_name = 'truncate_fails_when_dir_removed.txt'
  // handle = await createEmptyFile(file_name, dir)
  // wfs = await handle.createWritable()
  // await root.removeEntry('parent_dir', { recursive: true })
  // err = await wfs.truncate(0).catch(e=>e)
  // assert(err?.name === 'NotFoundError', 'truncate() fails when parent directory is removed')
})

t('createWritable({keepExistingData: true}): atomic writable file stream initialized with source contents', async (root) => {
  handle = await createFileWithContents('atomic_file_is_copied.txt', 'fooks', root)
  wfs = await handle.createWritable({ keepExistingData: true })
  await wfs.write('bar')
  await wfs.close()
  assert(await getFileContents(handle) === 'barks')
  assert(await getFileSize(handle) === 5)
})

t('createWritable({keepExistingData: false}): atomic writable file stream initialized with empty file', async (root) => {
  // TODO: fix me
  // handle = await createFileWithContents('atomic_file_is_not_copied.txt', 'very long string', root)
  // wfs = await handle.createWritable({ keepExistingData: false })
  // await wfs.write('bar')
  // assert(await getFileContents(handle) === 'very long string')
  // await wfs.close()
  // assert(await getFileContents(handle) === 'bar')
  // assert(await getFileSize(handle) === 3)
})

t('cursor position: truncate size > offset', async (root) => {
  handle = await createFileWithContents('trunc_smaller_offset.txt', '1234567890', root)
  wfs = await handle.createWritable({ keepExistingData: true })
  await wfs.truncate(5)
  await wfs.write('abc')
  await wfs.close()

  assert(await getFileContents(handle) === 'abc45')
  assert(await getFileSize(handle) === 5)
})

t('cursor position: truncate size < offset', async (root) => {
  handle = await createFileWithContents('trunc_bigger_offset.txt', '1234567890', root)
  wfs = await handle.createWritable({keepExistingData: true})
  await wfs.seek(6)
  await wfs.truncate(5)
  await wfs.write('abc')
  await wfs.close()
  assert(await getFileContents(handle) === '12345abc')
  assert(await getFileSize(handle) === 8)
})

t('commands are queued', async (root) => {
  handle = await createEmptyFile('contents', root)
  wfs = await handle.createWritable()
  wfs.write('abc')
  wfs.write('def')
  wfs.truncate(9)
  wfs.seek(0)
  wfs.write('xyz')
  await wfs.close()
  assert(await getFileContents(handle) === 'xyzdef\0\0\0')
  assert(await getFileSize(handle) === 9)
})

t('Large real data test', async (root) => { return
  const res = await fetch('https://webtorrent.io/torrents/Sintel/Sintel.mp4')
  const fileHandle = await root.getFile('movie.mp4', { create: true })
  const writable = await fileHandle.createWritable()
  await writable.truncate(~~res.headers.get('content-length'))
  const writer = writable.getWriter()
  const reader = res.body.getReader()
  const pump = () => reader.read()
    .then(res => res.done
      ? writer.close()
      : writer.write(res.value).then(pump))
      await pump()
      console.log('done downloading to fs')
  return pump()
})


// get some dummy gradient image
function img (format) {
    var a = document.createElement("canvas"),
        b = a.getContext("2d"),
        c = b.createLinearGradient(0, 0, 1500, 1500);
    a.width = a.height = 3000;
    c.addColorStop(0, "red");
    c.addColorStop(1, "blue");
    b.fillStyle = c;
    b.fillRect(0, 0, a.width, a.height);
    return new Promise(rs => {
      a.toBlob(rs, 'image/' + format, 1)
    }).then(b => b.arrayBuffer()).then(b => new Uint8Array(b))
}

const wrapper = manualTest.querySelector('tbody tr')
$test.onclick = async () => {
  const opts = {
    type: $type.value,
    multiple: $multiple.querySelector('input').checked,
    accepts: eval($accept.querySelector('textarea').value),
    excludeAcceptAllOption: $exclude.querySelector('input').checked,
    _name: $name.querySelector('input').value,
    _preferPolyfill: $preferPolyfill.querySelector('input').checked
  }
  const handle = await chooseFileSystemEntries(opts)
  assert(Array.isArray(handle) === !!opts.multiple)
  if (opts.multiple) handle = handle[0]
  assert(handle.isFile === ['openFile', 'saveFile'].includes(opts.type))
  assert(handle.isDirectory === (opts.type === 'openDirectory'))

  if (opts.type === 'saveFile') {
    const format = handle.name.split('.').pop()
    const image = await img(format)
    const ws = await handle.createWritable()
    return new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(image)
        ctrl.close()
      }
    }).pipeTo(ws)
  }
}
$type.onchange = () => {
  switch ($type.value) {
    case 'saveFile':
      $accept.hidden =
      $exclude.hidden =
      $name.hidden = false
      $multiple.hidden = true
      return
    case 'openDirectory':
      $exclude.hidden =
      $multiple.hidden =
      $accept.hidden =
      $name.hidden = true
      return
    case 'openFile':
      $exclude.hidden =
      $multiple.hidden =
      $accept.hidden = false
      $name.hidden = true
  }
}

$accept.querySelector('textarea').value = `[
  { extensions: ['jpg'] },
  { extensions: ['webp'] },
  { mimeTypes: ['image/png'] }
]`

async function init () {
  const drivers = await Promise.allSettled([
    FileSystemDirectoryHandle.getSystemDirectory({ type: 'sandbox', _driver: 'native' }),
    FileSystemDirectoryHandle.getSystemDirectory({ type: 'sandbox', _driver: 'sandbox', _persistent: false }),
    FileSystemDirectoryHandle.getSystemDirectory({ type: 'sandbox', _driver: 'memory' }),
    FileSystemDirectoryHandle.getSystemDirectory({ type: 'sandbox', _driver: 'indexeddb' })
  ])
  let j = 0
  for (let driver of drivers) {
    j++
    if (driver.status === 'rejected') continue
    const root = driver.value
    await cleanupSandboxedFileSystem(root)
    const total = performance.now()
    for (var i = 0; i < tests.length; i++) {
      const test = tests[i]
      await cleanupSandboxedFileSystem(root)
      const t = performance.now()
      await test(root).then(() => {
        const time = (performance.now() - t).toFixed(3)
        tBody.rows[i].cells[j].innerText = time + 'ms'
      }, (err) => {
        tBody.rows[i].cells[j].innerText = '❌'
        tBody.rows[i].cells[j].title = err.message
      })
    }
    table.tFoot.rows[0].cells[j].innerText = (performance.now() - total).toFixed(3)
  }
}

function arrayEqual(a1, a2) {
  assert(JSON.stringify(a1) === JSON.stringify(a2), `expected ${a2} to equal ${a1}`)
}

async function cleanupSandboxedFileSystem (root) {
    for await (let entry of root.getEntries()) {
        await root.removeEntry(entry.name, { recursive: entry.isDirectory })
    }
}

async function getFileSize(handle) {
    const file = await handle.getFile()
    return file.size
}

async function getFileContents (handle) {
    const file = await handle.getFile()
    return new Response(file).text()
}

async function getDirectoryEntryCount (handle) {
    let result = 0
    for await (let entry of handle.getEntries()) {
      result++
    }
    return result
}

async function getSortedDirectoryEntries(handle) {
  let result = [];
  for await (let entry of handle.getEntries()) {
    if (entry.isDirectory)
      result.push(entry.name + '/')
    else
      result.push(entry.name)
  }
  result.sort()
  return result
}

async function createDirectory(name, parent) {
  return parent.getDirectory(name, {create: true})
}

async function createEmptyFile(name, parent) {
  const handle = await parent.getFile(name, { create: true })
  // Make sure the file is empty.
  assert(await getFileSize(handle) === 0)
  return handle
}

async function createFileWithContents(name, contents, parent) {
  const handle = await createEmptyFile(name, parent)
  const Writable = await handle.createWritable()
  await Writable.write(contents)
  await Writable.close()
  return handle
}

// https://github.com/MattiasBuelens/web-streams-polyfill/issues/20 native streams
// https://github.com/whatwg/streams/issues/1018 ReadableStream.from(X)
function streamFromFetch(data) {
  return new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(data)
      ctrl.close()
    }
  })
}

init()
