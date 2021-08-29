import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js'
import { FileSystemFileHandle } from './FileSystemFileHandle.js'
import { FileHandle, FolderHandle } from './adapters/sandbox.js'

if (
  globalThis.DataTransferItem &&
  !globalThis.DataTransferItem.prototype.getAsFileSystemHandle &&
  !!globalThis.DataTransferItem.prototype.webkitGetAsEntry
) {
  globalThis.DataTransferItem.prototype.getAsFileSystemHandle = async function () {
    const entry: FileEntry | DirectoryEntry = this.webkitGetAsEntry()

    return entry.isFile
      ? new FileSystemFileHandle(new FileHandle(entry as FileEntry, false))
      : new FileSystemDirectoryHandle(new FolderHandle(entry as DirectoryEntry, false))
  }
}
