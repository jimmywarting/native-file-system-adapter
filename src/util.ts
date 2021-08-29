import type { FolderHandle } from './adapters/memory.js'
import { WriteChunkObject } from './interfaces.js'

declare global {
  interface File {
    webkitRelativePath?: string | undefined
  }
}

export const errors = {
  INVALID: ['seeking position failed.', 'InvalidStateError'],
  GONE: ['A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError'],
  MISMATCH: ['The path supplied exists, but was not an entry of requested type.', 'TypeMismatchError'],
  MOD_ERR: ['The object can not be modified in this way.', 'InvalidModificationError'],
  SYNTAX: (m: string) => [`Failed to execute 'write' on 'UnderlyingSinkBase': Invalid params passed. ${m}`, 'SyntaxError'],
  SECURITY: ['It was determined that certain files are unsafe for access within a Web application, or that too many calls are being made on file resources.', 'SecurityError'],
  DISALLOWED: ['The request is not allowed by the user agent or the platform in the current context.', 'NotAllowedError']
}

export const isChunkObject = (chunk: any): chunk is WriteChunkObject => {
  return typeof chunk === 'object' && typeof (chunk as WriteChunkObject).type !== 'undefined'
}

export async function makeDirHandleFromFileList (fileList: FileList) {
  const { FolderHandle, FileHandle } = await import('./adapters/memory.js')
  const { FileSystemDirectoryHandle } = await import('./FileSystemDirectoryHandle.js')

  if (!fileList[0].webkitRelativePath) {
    throw new Error(`File.webkitRelativePath is not supported`)
  }

  const [ rootName ] = fileList[0].webkitRelativePath.split('/', 1)
  const root = new FolderHandle(rootName, false)
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i]
    const path = file.webkitRelativePath!.split('/')
    // Remove the root folder part
    path.shift()
    const name = path.pop()!
    const dir = path.reduce((dir, path) => {
      if (!dir._entries[path]) dir._entries[path] = new FolderHandle(path, false)
      return dir._entries[path] as FolderHandle
    }, root)
    dir._entries[name] = new FileHandle(file.name, file, false)
  }
  return new FileSystemDirectoryHandle(root)
}

export async function makeFileHandlesFromFileList (fileList: FileList) {
  const { FileHandle } = await import('./adapters/memory.js')
  const { FileSystemFileHandle } = await import('./FileSystemFileHandle.js')

  const files = Array.from(fileList).map(file =>
    new FileSystemFileHandle(new FileHandle(file.name, file, false))
  )

  return files
}
