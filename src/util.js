export const errors = {
  INVALID: ['seeking position failed.', 'InvalidStateError'],
  GONE: ['A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError'],
  MISMATCH: ['The path supplied exists, but was not an entry of requested type.', 'TypeMismatchError'],
  MOD_ERR: ['The object can not be modified in this way.', 'InvalidModificationError'],
  SYNTAX: m => [`Failed to execute 'write' on 'UnderlyingSinkBase': Invalid params passed. ${m}`, 'SyntaxError'],
  SECURITY: ['It was determined that certain files are unsafe for access within a Web application, or that too many calls are being made on file resources.', 'SecurityError'],
  DISALLOWED: ['The request is not allowed by the user agent or the platform in the current context.', 'NotAllowedError']
}

export async function fromDataTransfer (entries) {
  const [ memory, sandbox, FileSystemDirectoryHandle ] = await Promise.all([
    import('./adapters/memory.js'),
    import('./adapters/sandbox.js'),
    import('./FileSystemDirectoryHandle.js')
  ])

  const folder = new memory.FolderHandle('', false)
  folder.entries = entries.map(entry => entry.isFile
    ? new sandbox.FileHandle(entry, false)
    : new sandbox.FolderHandle(entry, false)
  )

  return new FileSystemDirectoryHandle.default(folder)
}

export async function fromInput (input) {
  const { FolderHandle, FileHandle } = await import('./adapters/memory.js')
  const dir = await import('./FileSystemDirectoryHandle.js')
  const file = await import('./FileSystemFileHandle.js')
  const FileSystemDirectoryHandle = dir.default
  const FileSystemFileHandle = file.default

  let files = [...input.files]
  if (input.webkitdirectory) {
    const rootName = files[0].webkitRelativePath.split('/', 1)[0]
    const root = new FolderHandle(rootName, false)
    files.forEach(file => {
      const path = file.webkitRelativePath.split('/')
      path.shift()
      const name = path.pop()
      const dir = path.reduce((dir, path) => {
        if (!dir._entries[path]) dir._entries[path] = new FolderHandle(path, false)
        return dir._entries[path]
      }, root)
      dir.entries[name] = new FileHandle(file.name, file, false)
    })
    return new FileSystemDirectoryHandle(root)
  } else {
    const files = Array.from(input.files).map(file =>
      new FileSystemFileHandle(new FileHandle(file.name, file, false))
    )
    if (input.multiple) {
      return files
    } else {
      return files[0]
    }
  }
}
