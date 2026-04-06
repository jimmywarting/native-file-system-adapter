/**
 * Custom tests for the createWritable({ mode }) extension.
 *
 * These tests are NOT part of the WHATWG WPT suite because the `mode` option
 * is not yet in the spec.  They use the same `directory_test` helper that the
 * WPT scripts use so they integrate with the wpt-node.js runner and benefit
 * from the same per-test isolation (fresh root + lock cleanup).
 */

// ── exclusive-atomic ─────────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'excl_atomic_lock.txt', root)
  const writable = await cleanup_writable(t, await handle.createWritable({ mode: 'exclusive-atomic' }))
  await promise_rejects_dom(
    t,
    'NoModificationAllowedError',
    handle.createWritable({ mode: 'exclusive-atomic' })
  )
}, "createWritable({ mode: 'exclusive-atomic' }) rejects a second writable")

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'excl_atomic_close_release.txt', root)
  const w1 = await handle.createWritable({ mode: 'exclusive-atomic' })
  await w1.write('first')
  await w1.close()
  // Lock must be released after close() — a new exclusive writer must be accepted.
  const w2 = await handle.createWritable({ mode: 'exclusive-atomic' })
  await w2.write('second')
  await w2.close()
  assert_equals(await getFileContents(handle), 'second')
}, "createWritable({ mode: 'exclusive-atomic' }) lock is released after close()")

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'excl_atomic_abort.txt', 'original', root)
  const writable = await handle.createWritable({ mode: 'exclusive-atomic' })
  await writable.write('draft')
  await writable.abort()
  // File content must be unchanged — the swap file was discarded.
  assert_equals(await getFileContents(handle), 'original',
    'abort() must not modify the original file for exclusive-atomic mode')
  // Lock must be released after abort().
  const w2 = await cleanup_writable(t, await handle.createWritable({ mode: 'exclusive-atomic' }))
  await w2.close()
}, "createWritable({ mode: 'exclusive-atomic' }) abort() leaves the original file unchanged and releases lock")

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'excl_atomic_write.txt', root)
  const writable = await handle.createWritable({ mode: 'exclusive-atomic', keepExistingData: false })
  await writable.write('committed')
  // Changes must NOT be visible before close() (swap-file semantics).
  assert_equals(await getFileContents(handle), '',
    'exclusive-atomic: changes must not be visible before close()')
  await writable.close()
  assert_equals(await getFileContents(handle), 'committed')
}, "createWritable({ mode: 'exclusive-atomic' }) changes are not visible until close()")

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'excl_atomic_keep.txt', '0123456789', root)
  const writable = await handle.createWritable({ mode: 'exclusive-atomic', keepExistingData: true })
  await writable.write('abc')
  await writable.close()
  // keepExistingData:true copies the existing file into the swap buffer.
  assert_equals(await getFileContents(handle), 'abc3456789')
  assert_equals(await getFileSize(handle), 10)
}, "createWritable({ mode: 'exclusive-atomic', keepExistingData: true }) preserves existing content in swap buffer")

// ── exclusive-in-place ───────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'excl_inplace_lock.txt', root)
  const writable = await cleanup_writable(t, await handle.createWritable({ mode: 'exclusive-in-place' }))
  await promise_rejects_dom(
    t,
    'NoModificationAllowedError',
    handle.createWritable({ mode: 'exclusive-in-place' })
  )
}, "createWritable({ mode: 'exclusive-in-place' }) rejects a second writable")

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'excl_inplace_abort_release.txt', root)
  const w1 = await handle.createWritable({ mode: 'exclusive-in-place' })
  await w1.abort()
  // Lock must be released after abort().
  const w2 = await cleanup_writable(t, await handle.createWritable({ mode: 'exclusive-in-place' }))
  await w2.close()
}, "createWritable({ mode: 'exclusive-in-place' }) lock is released after abort()")

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'excl_inplace_visible.txt', root)
  const writable = await cleanup_writable(t, await handle.createWritable({ mode: 'exclusive-in-place' }))
  await writable.write('live')
  // In-place writes must be immediately visible before close().
  assert_equals(await getFileContents(handle), 'live',
    'exclusive-in-place: writes must be visible before close()')
  await writable.close()
  assert_equals(await getFileContents(handle), 'live')
}, "createWritable({ mode: 'exclusive-in-place' }) writes are immediately visible")

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'excl_inplace_tail.txt', '0123456789', root)
  const writable = await cleanup_writable(t, await handle.createWritable({ mode: 'exclusive-in-place', keepExistingData: true }))
  // Write only the first 3 bytes — the remaining 7 bytes must be preserved.
  await writable.write('abc')
  await writable.close()
  assert_equals(await getFileContents(handle), 'abc3456789',
    'exclusive-in-place with keepExistingData:true must preserve tail bytes')
  assert_equals(await getFileSize(handle), 10)
}, "createWritable({ mode: 'exclusive-in-place', keepExistingData: true }) preserves tail bytes")

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'excl_inplace_trunc.txt', 'existing content', root)
  const writable = await cleanup_writable(t, await handle.createWritable({ mode: 'exclusive-in-place', keepExistingData: false }))
  // File must be empty immediately after the stream is created (before any write).
  assert_equals(await getFileSize(handle), 0,
    'exclusive-in-place with keepExistingData:false must truncate file on open')
  await writable.write('new')
  await writable.close()
  assert_equals(await getFileContents(handle), 'new')
}, "createWritable({ mode: 'exclusive-in-place', keepExistingData: false }) truncates the file on open")

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'excl_inplace_trunc_visible.txt', 'hello world', root)
  const writable = await cleanup_writable(t, await handle.createWritable({ mode: 'exclusive-in-place', keepExistingData: true }))
  await writable.truncate(5)
  // truncate() must take effect immediately in in-place mode.
  assert_equals(await getFileSize(handle), 5,
    'exclusive-in-place: truncate() must be immediately visible')
  await writable.close()
  assert_equals(await getFileContents(handle), 'hello')
}, "createWritable({ mode: 'exclusive-in-place' }) truncate() is immediately visible")

// ── siloed ───────────────────────────────────────────────────────────────────

directory_test(async (t, root) => {
  const handle = await createEmptyFile(t, 'siloed_multi.txt', root)
  const w1 = await cleanup_writable(t, await handle.createWritable({ mode: 'siloed' }))
  const w2 = await cleanup_writable(t, await handle.createWritable({ mode: 'siloed' }))
  await w1.write('from1')
  await w2.write('from2')
  await w1.close()
  await w2.close()
  // Both closes must succeed; last close wins (content is one of the two values).
  const content = await getFileContents(handle)
  assert_true(
    content === 'from1' || content === 'from2',
    `siloed: expected 'from1' or 'from2', got '${content}'`
  )
}, "createWritable({ mode: 'siloed' }) allows multiple concurrent writables (last close wins)")

directory_test(async (t, root) => {
  const handle = await createFileWithContents(t, 'siloed_abort.txt', 'original', root)
  const writable = await handle.createWritable({ mode: 'siloed' })
  await writable.write('draft')
  await writable.abort()
  // After abort() the original content must be intact.
  assert_equals(await getFileContents(handle), 'original',
    'siloed: abort() must not modify the original file')
}, "createWritable({ mode: 'siloed' }) abort() leaves the original file unchanged")
