const arr = []
const t = (desc, fn) => arr.push({desc, fn})

let err, handle, existing_handle, file_handle, subdir, wfs, file_name, body, rs, dir

import {
  streamFromFetch,
  arrayEqual,
  assert,
  getFileSize,
  getFileContents,
  getDirectoryEntryCount,
  getSortedDirectoryEntries,
  createDirectory,
  createEmptyFile,
  createFileWithContents
} from './util.js'

t('getDirectoryHandle(create=false) rejects for non-existing directories', async root => {
  err = await root.getDirectoryHandle('non-existing-dir').catch(a=>a)
  assert(err instanceof DOMException)
  assert(err.name === 'NotFoundError')
})

t('getDirectoryHandle(create=true) creates an empty directory', async root => {
  handle = await root.getDirectoryHandle('non-existing-dir', { create: true })
  assert(handle.kind === 'directory')
  assert(handle.name === 'non-existing-dir')
  assert(await getDirectoryEntryCount(handle) === 0)
  arrayEqual(await getSortedDirectoryEntries(root), ['non-existing-dir/'])
})

t('getDirectoryHandle(create=false) returns existing directories', async root => {
  existing_handle = await root.getDirectoryHandle('dir-with-contents', { create: true })
  file_handle = await createEmptyFile('test-file', existing_handle)
  handle = await root.getDirectoryHandle('dir-with-contents', { create: false })
  assert(handle.kind === 'directory')
  assert(handle.name === 'dir-with-contents')
  arrayEqual(await getSortedDirectoryEntries(handle), ['test-file'])
})

t('getDirectoryHandle(create=true) returns existing directories without erasing', async root => {
  existing_handle = await root.getDirectoryHandle('dir-with-contents', { create: true })
  file_handle = await existing_handle.getFileHandle('test-file', { create: true })
  handle = await root.getDirectoryHandle('dir-with-contents', { create: true })
  assert(handle.kind === 'directory')
  assert(handle.name === 'dir-with-contents')
  arrayEqual(await getSortedDirectoryEntries(handle), ['test-file'])
})

t('getDirectoryHandle() when a file already exists with the same name', async root => {
  await createEmptyFile('file-name', root)
  err = await root.getDirectoryHandle('file-name').catch(e=>e)
  assert(err.name === 'TypeMismatchError')
  err = await root.getDirectoryHandle('file-name', { create: false }).catch(e=>e)
  assert(err.name === 'TypeMismatchError')
  err = await root.getDirectoryHandle('file-name', {create: true}).catch(e=>e)
})

t('getDirectoryHandle() with empty name', async root => {
  err = await root.getDirectoryHandle('', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getDirectoryHandle('', {create: false}).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getDirectoryHandle(create=true) with empty name', async root => {
  err = await root.getDirectoryHandle('.').catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getDirectoryHandle('.', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getDirectoryHandle() with ".." name', async root => {
  subdir = await createDirectory('subdir-name', root)
  err = await subdir.getDirectoryHandle('..').catch(e=>e)
  assert(err instanceof TypeError)
  err = await subdir.getDirectoryHandle('..', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getDirectoryHandle(create=false) with a path separator when the directory exists', async root => {
  const first_subdir_name = 'first-subdir-name'
  const first_subdir = await createDirectory(first_subdir_name, root)
  const second_subdir_name = 'second-subdir-name'
  await createDirectory(second_subdir_name, first_subdir)
  const path_with_separator = `${first_subdir_name}/${second_subdir_name}`
  err = await root.getDirectoryHandle(path_with_separator).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getDirectoryHandle(create=true) with a path separator', async root => {
  const subdir_name = 'subdir-name';
  const subdir = await createDirectory(subdir_name, root);
  const path_with_separator = `${subdir_name}/file_name`;
  err = await root.getDirectoryHandle(path_with_separator, { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFileHandle(create=false) rejects for non-existing files', async root => {
  err = await root.getFileHandle('non-existing-file').catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('getFileHandle(create=true) creates an empty file for non-existing files', async root => {
  handle = await root.getFileHandle('non-existing-file', { create: true })
  assert(handle.kind === 'file')
  assert(handle.name === 'non-existing-file')
  assert(await getFileSize(handle) === 0)
  assert(await getFileContents(handle) === '')
})

t('getFileHandle(create=false) returns existing files', async root => {
  existing_handle = await createFileWithContents('existing-file', '1234567890', root)
  handle = await root.getFileHandle('existing-file')
  assert(handle.kind === 'file')
  assert(handle.name === 'existing-file')
  assert(await getFileSize(handle) === 10)
  assert(await getFileContents(handle) === '1234567890')
})

t('getFileHandle(create=true) returns existing files without erasing', async root => {
  existing_handle = await createFileWithContents('file-with-contents', '1234567890', root)
  handle = await root.getFileHandle('file-with-contents', { create: true })
  assert(handle.kind === 'file')
  assert(handle.name === 'file-with-contents')
  assert(await getFileSize(handle) === 10)
  assert(await getFileContents(handle) === '1234567890')
})

t('getFileHandle(create=false) when a directory already exists with the same name', async root => {
  await root.getDirectoryHandle('dir-name', { create: true })
  err = await root.getFileHandle('dir-name').catch(e=>e)
  assert(err.name === 'TypeMismatchError')
})

t('getFileHandle(create=true) when a directory already exists with the same name', async root => {
  await root.getDirectoryHandle('dir-name', { create: true })
  err = await root.getFileHandle('dir-name', { create: true }).catch(e=>e)
  assert(err.name === 'TypeMismatchError')
})

t('getFileHandle() with empty name', async root => {
  err = await root.getFileHandle('', {create: true}).catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getFileHandle('', {create: false}).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFileHandle() with "." name', async root => {
  err = await root.getFileHandle('.').catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getFileHandle('.', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFileHandle() with ".." name', async root => {
  err = await root.getFileHandle('..').catch(e=>e)
  assert(err instanceof TypeError)
  err = await root.getFileHandle('..', { create: true }).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFileHandle(create=false) with a path separator when the file exists.', async root => {
  await createDirectory('subdir-name', root)
  err = await root.getFileHandle(`subdir-name/file_name`).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFileHandle(create=true) with a path separator', async root => {
  await createDirectory('subdir-name', root)
  err = await root.getFileHandle(`subdir-name/file_name`, {create: true}).catch(e=>e)
  assert(err instanceof TypeError)
})

t('removeEntry() to remove a file', async root => {
  handle = await createFileWithContents('file-to-remove', '12345', root)
  await createFileWithContents('file-to-keep', 'abc', root)
  await root.removeEntry('file-to-remove')
  arrayEqual(await getSortedDirectoryEntries(root), ['file-to-keep'])
  err = await getFileContents(handle).catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('removeEntry() on an already removed file should fail', async root => {
  handle = await createFileWithContents('file-to-remove', '12345', root)
  await root.removeEntry('file-to-remove')
  err = await root.removeEntry('file-to-remove').catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('removeEntry() to remove an empty directory', async root => {
  handle = await root.getDirectoryHandle('dir-to-remove', { create: true })
  await createFileWithContents('file-to-keep', 'abc', root)
  await root.removeEntry('dir-to-remove')
  arrayEqual(await getSortedDirectoryEntries(root), ['file-to-keep'])
  err = await getSortedDirectoryEntries(handle).catch(e=>e)
})

t('removeEntry() on a non-empty directory should fail', async root => {
  handle = await root.getDirectoryHandle('dir-to-remove', { create: true })
  await createEmptyFile('file-in-dir', handle)
  err = await root.removeEntry('dir-to-remove').catch(e=>e)
  assert(err.name === 'InvalidModificationError')
  arrayEqual(await getSortedDirectoryEntries(root), ['dir-to-remove/'])
  arrayEqual(await getSortedDirectoryEntries(handle), ['file-in-dir']);
})

t('removeEntry() with empty name should fail', async root => {
  handle = await createDirectory('dir', root)
  err = await handle.removeEntry('').catch(e=>e)
  assert(err instanceof TypeError)
})

t('removeEntry() with "." name should fail', async root => {
  handle = await createDirectory('dir', root)
  err = await handle.removeEntry('.').catch(e=>e)
  assert(err instanceof TypeError)
})

t('removeEntry() with ".." name should fail', async root => {
  handle = await createDirectory('dir', root)
  err = await handle.removeEntry('..').catch(e=>e)
  assert(err instanceof TypeError)
})

t('removeEntry() with a path separator should fail.', async root => {
  dir = await createDirectory('dir-name', root)
  await createEmptyFile('file-name', dir)
  err = await root.removeEntry(`dir-name/file-name`).catch(e=>e)
  assert(err instanceof TypeError)
})

t('getFile() provides a file that can be sliced', async root => {
  const fileContents = 'awesome content'
  handle = await createFileWithContents('foo.txt', fileContents, root)
  let file = await handle.getFile()
  let slice = file.slice(1, file.size)
  let actualContents = await slice.text()
  assert(actualContents === fileContents.slice(1, fileContents.length))
})

t('getFile() returns last modified time', async root => {
  handle = await createEmptyFile('mtime.txt', root)
  const first_mtime = (await handle.getFile()).lastModified
  await new Promise(rs => setTimeout(rs, 100))
  wfs = await handle.createWritable({ keepExistingData: false })
  await wfs.write('foo')
  await wfs.close()
  const second_mtime = (await handle.getFile()).lastModified
  let fileReplica = await handle.getFile()
  assert(second_mtime === fileReplica.lastModified)
  assert(first_mtime < second_mtime, 'expected first modified time to be lower than first')
})

t('can be piped to with a string', async root => {
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

t('can be piped to with an ArrayBuffer', async root => {
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

t('can be piped to with a Blob', async root => {
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

t('can be piped to with a param object with write command', async root => {
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

t('can be piped to with a param object with multiple commands', async root => {
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
  assert(await getFileSize(handle) === 10, 'Excpected file size to be 10')
  assert(await getFileContents(handle) === 'bazbar\0\0\0\0')
})

t('multiple operations can be queued', async root => {
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

t('plays well with fetch', async root => {
  handle = await createEmptyFile('fetched.txt', root)
  wfs = await handle.createWritable()
  body = streamFromFetch('fetched from far')
  await body.pipeTo(wfs, { preventCancel: true })
  assert(await getFileContents(handle) === 'fetched from far')
  assert(await getFileSize(handle) === 16)
})

t('abort() aborts write', async root => {
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

t('write() with an empty blob to an empty file', async root => {
  handle = await createEmptyFile('empty_blob', root)
  wfs = await handle.createWritable()
  await wfs.write(new Blob([]))
  await wfs.close()
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() a blob to an empty file', async root => {
  handle = await createEmptyFile('valid_blob', root);
  wfs = await handle.createWritable();
  await wfs.write(new Blob(['1234567890']))
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() with WriteParams without position to an empty file', async root => {
  handle = await createEmptyFile('write_param_empty', root)
  wfs = await handle.createWritable();
  await wfs.write({type: 'write', data: '1234567890'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() with WriteParams without position to an empty file', async root => {
  handle = await createEmptyFile('write_param_empty', root)
  wfs = await handle.createWritable()
  await wfs.write({type: 'write', data: '1234567890'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() a string to an empty file with zero offset', async root => {
  handle = await createEmptyFile('string_zero_offset', root)
  wfs = await handle.createWritable()
  await wfs.write({type: 'write', position: 0, data: '1234567890'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() a blob to an empty file with zero offset', async root => {
  handle = await createEmptyFile('blob_zero_offset', root)
  wfs = await handle.createWritable()
  await wfs.write({ type: 'write', position: 0, data: new Blob(['1234567890']) })
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() called consecutively appends', async root => {
  handle = await createEmptyFile('write_appends', root)
  wfs = await handle.createWritable()
  await wfs.write('12345')
  await wfs.write('67890')
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() WriteParams without position and string appends', async root => {
  handle = await createEmptyFile('write_appends_object_string', root)
  wfs = await handle.createWritable()
  await wfs.write('12345')
  await wfs.write({type: 'write', data: '67890'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() WriteParams without position and blob appends', async root => {
  handle = await createEmptyFile('write_appends_object_blob', root)
  wfs = await handle.createWritable()
  await wfs.write('12345')
  await wfs.write({type: 'write', data: new Blob(['67890'])})
  await wfs.close()
  assert(await getFileContents(handle) === '1234567890')
  assert(await getFileSize(handle) === 10)
})

t('write() called with a string and a valid offset', async root => {
  handle = await createEmptyFile('string_with_offset', root)
  wfs = await handle.createWritable()
  await wfs.write('1234567890')
  await wfs.write({type: 'write', position: 4, data: 'abc'})
  await wfs.close()
  assert(await getFileContents(handle) === '1234abc890')
  assert(await getFileSize(handle) === 10)
})

t('write() called with a blob and a valid offset', async root => {
  handle = await createEmptyFile('blob_with_offset', root)
  wfs = await handle.createWritable()
  await wfs.write('1234567890')
  await wfs.write({type: 'write', position: 4, data: new Blob(['abc'])})
  await wfs.close()
  assert(await getFileContents(handle) === '1234abc890')
  assert(await getFileSize(handle) === 10)
})

t('write() called with an invalid offset', async root => {
  handle = await createEmptyFile('bad_offset', root)
  wfs = await handle.createWritable()
  err = await wfs.write({ type: 'write', position: 4, data: new Blob(['abc']) }).catch(e=>e)
  assert(err, 'Expected to get an error back. Got ' + err)
  assert(err.name === 'InvalidStateError')
  err = await wfs.close().catch(e=>e)
  assert(err instanceof TypeError)
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() with an empty string to an empty file', async root => {
  handle = await createEmptyFile('empty_string', root)
  wfs = await handle.createWritable()
  await wfs.write('')
  await wfs.close()
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() with a valid utf-8 string', async root => {
  handle = await createEmptyFile('valid_utf8_string', root)
  wfs = await handle.createWritable()
  await wfs.write('foo🤘')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo🤘')
  assert(await getFileSize(handle) === 7)
})

t('write() with a string with unix line ending preserved', async root => {
  handle = await createEmptyFile('string_with_unix_line_ending', root)
  wfs = await handle.createWritable()
  await wfs.write('foo\n')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo\n')
  assert(await getFileSize(handle) === 4)
}),

t('write() with a string with windows line ending preserved', async root => {
  handle = await createEmptyFile('string_with_windows_line_ending', root)
  wfs = await handle.createWritable()
  await wfs.write('foo\r\n')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo\r\n')
  assert(await getFileSize(handle) === 5)
})

t('write() with an empty array buffer to an empty file', async root => {
  handle = await createEmptyFile('empty_array_buffer', root)
  wfs = await handle.createWritable()
  await wfs.write(new ArrayBuffer(0))
  await wfs.close()
  assert(await getFileContents(handle) === '')
  assert(await getFileSize(handle) === 0)
})

t('write() with a valid typed array buffer', async root => {
  handle = await createEmptyFile('valid_string_typed_byte_array', root)
  wfs = await handle.createWritable()
  const buf = new Uint8Array([102, 111, 111]).buffer
  await wfs.write(buf)
  await wfs.close()
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
})

t('atomic writes: close() fails when parent directory is removed', async root => {
  dir = await createDirectory('parent_dir', root)
  file_name = 'close_fails_when_dir_removed.txt'
  handle = await createEmptyFile(file_name, dir)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  await root.removeEntry('parent_dir', { recursive: true })
  err = await wfs.close().catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('atomic writes: writable file streams make atomic changes on close', async root => {
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


t('atomic writes: write() after close() fails', async root => {
  handle = await createEmptyFile('atomic_write_after_close.txt', root)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
  err = await wfs.write('abc').catch(e=>e)
  assert(err instanceof TypeError)
})

t('atomic writes: truncate() after close() fails', async root => {
  handle = await createEmptyFile('atomic_truncate_after_close.txt', root)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
  err = await wfs.truncate(0).catch(e=>e)
  assert(err instanceof TypeError)
})

t('atomic writes: close() after close() fails', async root => {
  handle = await createEmptyFile('atomic_close_after_close.txt', root)
  wfs = await handle.createWritable()
  await wfs.write('foo')
  await wfs.close()
  assert(await getFileContents(handle) === 'foo')
  assert(await getFileSize(handle) === 3)
  err = await wfs.close().catch(e=>e)
  assert(err instanceof TypeError)
})

t('atomic writes: only one close() operation may succeed', async root => {
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

t('getWriter() can be used', async root => {
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

t('writing small bits advances the position', async root => {
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

t('WriteParams: truncate missing size param', async root => {
  handle = await createFileWithContents('content.txt', 'very long string', root)
  wfs = await handle.createWritable()
  err = await wfs.write({ type: 'truncate' }).catch(e=>e)
  assert(err.name === 'SyntaxError')
})

t('WriteParams: write missing data param', async root => {
  handle = await createEmptyFile('content.txt', root)
  wfs = await handle.createWritable()
  err = await wfs.write({ type: 'write' }).catch(e=>e)
  assert(err.name === 'SyntaxError')
})

t('WriteParams: seek missing position param', async root => {
  handle = await createFileWithContents('content.txt', 'seekable', root)
  wfs = await handle.createWritable()
  err = await wfs.write({ type: 'seek' }).catch(e=>e)
  assert(err.name === 'SyntaxError')
})

t('truncate() to shrink a file', async root => {
  handle = await createEmptyFile('trunc_shrink', root)
  wfs = await handle.createWritable()
  await wfs.write('1234567890')
  await wfs.truncate(5)
  await wfs.close()
  assert(await getFileContents(handle) === '12345')
  assert(await getFileSize(handle) === 5)
})

t('truncate() to grow a file', async root => {
  handle = await createEmptyFile('trunc_grow', root)
  wfs = await handle.createWritable()
  await wfs.write('abc')
  await wfs.truncate(5)
  await wfs.close()
  assert(await getFileContents(handle) === 'abc\0\0')
  assert(await getFileSize(handle) === 5)
})

t('createWritable() fails when parent directory is removed', async root => {
  dir = await createDirectory('parent_dir', root)
  handle = await createEmptyFile('create_writable_fails_when_dir_removed.txt', dir)
  await root.removeEntry('parent_dir', { recursive: true })
  err = await handle.createWritable().catch(e=>e)
  assert(err.name === 'NotFoundError')
})

t('write() fails when parent directory is removed', async root => {
  // TODO: fix me
  // dir = await createDirectory('parent_dir', root)
  // handle = await createEmptyFile('write_fails_when_dir_removed.txt', dir)
  // wfs = await handle.createWritable()
  // await root.removeEntry('parent_dir', { recursive: true })
  // err = await wfs.write('foo').catch(e=>e)
  // assert(err?.name === 'NotFoundError', 'write() fails when parent directory is removed')
})

t('truncate() fails when parent directory is removed', async root => {
  // TODO: fix me
  // dir = await createDirectory('parent_dir', root)
  // file_name = 'truncate_fails_when_dir_removed.txt'
  // handle = await createEmptyFile(file_name, dir)
  // wfs = await handle.createWritable()
  // await root.removeEntry('parent_dir', { recursive: true })
  // err = await wfs.truncate(0).catch(e=>e)
  // assert(err?.name === 'NotFoundError', 'truncate() fails when parent directory is removed')
})

t('createWritable({keepExistingData: true}): atomic writable file stream initialized with source contents', async root => {
  handle = await createFileWithContents('atomic_file_is_copied.txt', 'fooks', root)
  wfs = await handle.createWritable({ keepExistingData: true })
  await wfs.write('bar')
  await wfs.close()
  assert(await getFileContents(handle) === 'barks')
  assert(await getFileSize(handle) === 5)
})

t('createWritable({keepExistingData: false}): atomic writable file stream initialized with empty file', async root => {
  // TODO: fix me
  // handle = await createFileWithContents('atomic_file_is_not_copied.txt', 'very long string', root)
  // wfs = await handle.createWritable({ keepExistingData: false })
  // await wfs.write('bar')
  // assert(await getFileContents(handle) === 'very long string')
  // await wfs.close()
  // assert(await getFileContents(handle) === 'bar')
  // assert(await getFileSize(handle) === 3)
})

t('cursor position: truncate size > offset', async root => {
  handle = await createFileWithContents('trunc_smaller_offset.txt', '1234567890', root)
  wfs = await handle.createWritable({ keepExistingData: true })
  await wfs.truncate(5)
  await wfs.write('abc')
  await wfs.close()

  assert(await getFileSize(handle) === 5, 'expected file size to be 5')
  assert(await getFileContents(handle) === 'abc45')
})

t('cursor position: truncate size < offset', async root => {
  handle = await createFileWithContents('trunc_bigger_offset.txt', '1234567890', root)
  wfs = await handle.createWritable({ keepExistingData: true })
  await wfs.seek(6)
  await wfs.truncate(5)
  await wfs.write('abc')
  await wfs.close()
  assert(await getFileSize(handle) === 8, 'expected file size to be 8')
  assert(await getFileContents(handle) === '12345abc', 'expected file to contain 12345abc')
})

t('commands are queued', async root => {
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

t('queryPermission(writable=false) returns granted', async root => {
  assert(await root.queryPermission({ writable: false }) === 'granted')
})

t('queryPermission(writable=true) returns granted', async root => {
  assert(await root.queryPermission({ writable: false }) === 'granted')
})

t('queryPermission(readable=true) returns granted', async root => {
  assert(await root.queryPermission({ writable: false }) === 'granted')
})

t('queryPermission(readable=false) returns granted', async root => {
  assert(await root.queryPermission({ writable: false }) === 'granted')
})

t('Large real data test', async root => { return
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

export default arr
