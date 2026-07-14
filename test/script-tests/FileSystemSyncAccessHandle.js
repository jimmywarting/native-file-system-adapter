/**
 * Custom tests for FileSystemSyncAccessHandle.
 *
 * These tests exercise createSyncAccessHandle() and the synchronous
 * FileSystemSyncAccessHandle API (read, write, truncate, getSize, flush, close).
 *
 * They use the same `directory_test` helper as the WPT scripts so they
 * integrate with the wpt-node.js runner.
 */

// ── createSyncAccessHandle ────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_basic.txt', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  assert_true(access instanceof FileSystemSyncAccessHandle,
    'createSyncAccessHandle() returns a FileSystemSyncAccessHandle')
  assert_equals(typeof access.read, 'function')
  assert_equals(typeof access.write, 'function')
  assert_equals(typeof access.truncate, 'function')
  assert_equals(typeof access.getSize, 'function')
  assert_equals(typeof access.flush, 'function')
  assert_equals(typeof access.close, 'function')
  access.close()
}, 'createSyncAccessHandle() returns a FileSystemSyncAccessHandle with the expected API')

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_exclusive.txt', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  await promise_rejects_dom(t, 'NoModificationAllowedError',
    handle.createSyncAccessHandle(),
    'second createSyncAccessHandle() must be rejected')
  access.close()
}, 'createSyncAccessHandle() rejects when an exclusive lock is already held')

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_blocks_writable.txt', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  await promise_rejects_dom(t, 'NoModificationAllowedError',
    handle.createWritable(),
    'createWritable() must be rejected while sync handle is open')
  access.close()
}, 'createSyncAccessHandle() prevents createWritable() while open')

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_writable_blocks.txt', root)
  const writable = await handle.createWritable()
  t.add_cleanup(async () => { try { await writable.close() } catch (_) {} })

  await promise_rejects_dom(t, 'NoModificationAllowedError',
    handle.createSyncAccessHandle(),
    'createSyncAccessHandle() must be rejected while a writable is open')
  await writable.close()
}, 'createSyncAccessHandle() is rejected when a writable is already open')

// ── getSize ───────────────────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_getsize.txt', 'hello', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  assert_equals(access.getSize(), 5, 'getSize() returns the file byte length')
  access.close()
}, 'getSize() returns the current file size')

// ── read ──────────────────────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_read.txt', 'hello', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  const buf = new Uint8Array(5)
  const bytesRead = access.read(buf)
  assert_equals(bytesRead, 5, 'read() returns the number of bytes read')
  assert_equals(new TextDecoder().decode(buf), 'hello', 'read() fills the buffer with file bytes')
  access.close()
}, 'read() reads the full file content')

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_read_at.txt', 'hello world', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  const buf = new Uint8Array(5)
  const bytesRead = access.read(buf, { at: 6 })
  assert_equals(bytesRead, 5, 'read({at}) returns 5 bytes')
  assert_equals(new TextDecoder().decode(buf), 'world')
  access.close()
}, 'read({ at }) reads from the specified offset')

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_read_cursor.txt', 'abcdef', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  const buf1 = new Uint8Array(3)
  access.read(buf1)
  assert_equals(new TextDecoder().decode(buf1), 'abc', 'first read advances cursor')

  const buf2 = new Uint8Array(3)
  access.read(buf2)
  assert_equals(new TextDecoder().decode(buf2), 'def', 'second read continues from cursor')
  access.close()
}, 'read() without {at} advances the file position cursor')

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_read_at_no_cursor.txt', 'abcdef', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  const buf = new Uint8Array(3)
  access.read(buf, { at: 3 })  // read 'def' but should NOT advance cursor

  const buf2 = new Uint8Array(3)
  access.read(buf2)  // should read 'abc' from cursor (still at 0)
  assert_equals(new TextDecoder().decode(buf2), 'abc',
    'read({at}) must not affect the file position cursor')
  access.close()
}, 'read({ at }) does not advance the file position cursor')

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_read_past_eof.txt', 'hi', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  const buf = new Uint8Array(10)
  const bytesRead = access.read(buf, { at: 100 })
  assert_equals(bytesRead, 0, 'read() past EOF returns 0')
  access.close()
}, 'read() past EOF returns 0')

// ── write ─────────────────────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_write.txt', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  const data = new TextEncoder().encode('hello')
  const bytesWritten = access.write(data)
  assert_equals(bytesWritten, 5, 'write() returns the number of bytes written')
  assert_equals(access.getSize(), 5, 'getSize() reflects the written bytes')
  access.close()

  assert_equals(await getFileContents(handle), 'hello', 'file content matches what was written')
}, 'write() writes bytes and updates file size')

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_write_at.txt', 'hello world', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  access.write(new TextEncoder().encode('there'), { at: 6 })
  access.close()
  assert_equals(await getFileContents(handle), 'hello there')
}, 'write({ at }) writes at the specified offset')

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_write_cursor.txt', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  access.write(new TextEncoder().encode('abc'))
  access.write(new TextEncoder().encode('def'))
  access.close()
  assert_equals(await getFileContents(handle), 'abcdef', 'sequential writes use the cursor')
}, 'write() without {at} appends using the file position cursor')

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_write_grow.txt', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  // Write at offset 5 on an empty file — gap should be zero-filled.
  access.write(new TextEncoder().encode('hi'), { at: 5 })
  assert_equals(access.getSize(), 7)

  const buf = new Uint8Array(7)
  access.read(buf, { at: 0 })
  // bytes 0-4 should be 0x00; bytes 5-6 should be 'hi'
  assert_equals(buf[0], 0)
  assert_equals(buf[4], 0)
  assert_equals(buf[5], 'h'.charCodeAt(0))
  assert_equals(buf[6], 'i'.charCodeAt(0))
  access.close()
}, 'write({ at }) past EOF zero-fills the gap')

// ── truncate ──────────────────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_truncate.txt', 'hello world', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  access.truncate(5)
  assert_equals(access.getSize(), 5)
  access.close()
  assert_equals(await getFileContents(handle), 'hello')
}, 'truncate() shrinks the file')

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_truncate_grow.txt', 'hi', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  access.truncate(5)
  assert_equals(access.getSize(), 5)
  const buf = new Uint8Array(5)
  access.read(buf, { at: 0 })
  assert_equals(buf[0], 'h'.charCodeAt(0))
  assert_equals(buf[1], 'i'.charCodeAt(0))
  assert_equals(buf[2], 0)
  assert_equals(buf[4], 0)
  access.close()
}, 'truncate() zero-extends the file')

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'sync_truncate_cursor.txt', 'hello world', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  // Advance cursor past the truncation point.
  access.read(new Uint8Array(8))
  assert_equals(access.getSize(), 11)

  access.truncate(3)
  assert_equals(access.getSize(), 3)
  // Cursor must be clamped to newSize.
  const buf = new Uint8Array(1)
  const n = access.read(buf)
  assert_equals(n, 0, 'cursor was clamped to newSize so read returns 0')
  access.close()
}, 'truncate() clamps the file position cursor when it exceeds newSize')

// ── flush ─────────────────────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_flush.txt', root)
  const access = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access.close() } catch (_) {} })

  access.write(new TextEncoder().encode('flushed'))
  access.flush()
  access.close()
  assert_equals(await getFileContents(handle), 'flushed')
}, 'flush() persists written data')

// ── close ─────────────────────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_close_idempotent.txt', root)
  const access = await handle.createSyncAccessHandle()

  access.close()
  // Calling close() a second time must not throw.
  access.close()
}, 'close() is idempotent')

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_use_after_close.txt', root)
  const access = await handle.createSyncAccessHandle()
  access.close()

  assert_throws_dom('InvalidStateError', () => access.read(new Uint8Array(1)),
    'read() after close() throws InvalidStateError')
  assert_throws_dom('InvalidStateError', () => access.write(new Uint8Array(1)),
    'write() after close() throws InvalidStateError')
  assert_throws_dom('InvalidStateError', () => access.truncate(0),
    'truncate() after close() throws InvalidStateError')
  assert_throws_dom('InvalidStateError', () => access.getSize(),
    'getSize() after close() throws InvalidStateError')
  assert_throws_dom('InvalidStateError', () => access.flush(),
    'flush() after close() throws InvalidStateError')
}, 'all methods throw InvalidStateError after close()')

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_close_releases_lock.txt', root)
  const access = await handle.createSyncAccessHandle()
  access.close()

  // After close(), the lock must be released — a new handle must be obtainable.
  const access2 = await handle.createSyncAccessHandle()
  t.add_cleanup(() => { try { access2.close() } catch (_) {} })
  access2.close()
}, 'close() releases the exclusive lock')

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'sync_close_allows_writable.txt', root)
  const access = await handle.createSyncAccessHandle()
  access.close()

  const writable = await handle.createWritable()
  t.add_cleanup(async () => { try { await writable.close() } catch (_) {} })
  await writable.close()
}, 'close() allows createWritable() to succeed afterwards')
