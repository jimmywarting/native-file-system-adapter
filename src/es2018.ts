import { showDirectoryPicker } from './showDirectoryPicker.js'
import { showOpenFilePicker } from './showOpenFilePicker.js'
import { showSaveFilePicker } from './showSaveFilePicker.js'
import { getOriginPrivateDirectory } from './getOriginPrivateDirectory.js'
import { FileSystemDirectoryHandle } from './FileSystemDirectoryHandle.js'
import { FileSystemFileHandle } from './FileSystemFileHandle.js'
import { FileSystemHandle } from './FileSystemHandle.js'
import { support } from './support.js'

const polyfillDataTransferItem = () => import('./polyfillDataTransferItem.js')
const lazyFileSystemWritableFileStream = () => import('./FileSystemWritableFileStream.js').then(m => m.default)

export {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
  lazyFileSystemWritableFileStream,
  getOriginPrivateDirectory,
  showDirectoryPicker,
  showOpenFilePicker,
  showSaveFilePicker,
  polyfillDataTransferItem,
  support
}
