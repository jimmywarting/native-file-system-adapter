
export function streamFromFetch(data) {
  return new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(data)
      ctrl.close()
    }
  })
}

export function arrayEqual (a1, a2) {
  assert(JSON.stringify(a1) === JSON.stringify(a2), `expected ${a2} to equal ${a1}`)
}

export function assert (r, msg = 'Assertion failed') {
  if (!r) throw new Error(msg)
}

export async function getFileSize (handle) {
    const file = await handle.getFile()
    return file.size
}

export async function getFileContents (handle) {
    const file = await handle.getFile()
    return file.text()
}

export async function getDirectoryEntryCount (handle) {
    let result = 0
    for await (let entry of handle.entries()) {
      result++
    }
    return result
}

export async function getSortedDirectoryEntries (handle) {
  let result = [];
  for await (let entry of handle.entries()) {
    if (entry.kind === 'directory')
      result.push(entry.name + '/')
    else
      result.push(entry.name)
  }
  result.sort()
  return result
}

export async function createDirectory(name, parent) {
  return parent.getDirectoryHandle(name, {create: true})
}

export async function createEmptyFile(name, parent) {
  const handle = await parent.getFileHandle(name, { create: true })
  // Make sure the file is empty.
  assert(await getFileSize(handle) === 0)
  return handle
}

export async function createFileWithContents(name, contents, parent) {
  const handle = await createEmptyFile(name, parent)
  const Writable = await handle.createWritable()
  await Writable.write(contents)
  await Writable.close()
  return handle
}
