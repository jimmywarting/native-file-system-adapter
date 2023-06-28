// Want to remove this postMessage hack, tell them u want transferable streams:
// https://bugs.webkit.org/show_bug.cgi?id=215485
// And also tell them u want createWritable
// https://bugs.webkit.org/show_bug.cgi?id=254726

let fileHandle, handle

onmessage = async evt => {
  const port = evt.ports[0]
  const cmd = evt.data
  switch (cmd.type) {
    case 'open':
      const file = cmd.name

      let dir = await navigator.storage.getDirectory()

      for (const folder of cmd.path) {
        dir = await dir.getDirectoryHandle(folder)
      }

      fileHandle = await dir.getFileHandle(file)
      handle = await fileHandle.createSyncAccessHandle()
      break
    case 'write':
      handle.write(cmd.data, { at: cmd.position })
      handle.flush()
      break
    case 'truncate':
      handle.truncate(cmd.size)
      break
    case 'abort':
    case 'close':
      handle.close()
      break
  }

  port.postMessage(0)
}
