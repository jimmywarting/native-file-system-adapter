export interface AdapterModule<TOptions> {
  default: Adapter<TOptions>
}

export interface Adapter<TOptions> {
  (opts: TOptions): FileSystemFolderHandleAdapter | Promise<FileSystemFolderHandleAdapter>
}

export interface FileSystemHandleAdapter {
  readonly kind: 'file' | 'directory'
  readonly name: string
  writable: boolean

  isSameEntry(other: this): Promise<boolean>
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

export interface FileSystemFileHandleAdapter<W = WriteChunk> extends FileSystemHandleAdapter {
  readonly kind: 'file'

  createWritable(options: FileSystemCreateWritableOptions): Promise<UnderlyingSink<W>>
  getFile(): Promise<File>
}

export interface FileSystemFolderHandleAdapter extends FileSystemHandleAdapter {
  readonly kind: 'directory'

  entries(): AsyncGenerator<[string, FileSystemFileHandleAdapter | FileSystemFolderHandleAdapter], void, undefined>
  getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandleAdapter>
  getDirectoryHandle(name: string, opts?: FileSystemGetDirectoryOptions): Promise<FileSystemFolderHandleAdapter>
  removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>
}

export type WriteChunk = BufferSource | Blob | string | WriteChunkObject
export type WriteChunkObject = WriteChunkSeekObject | WriteChunkWriteObject | WriteChunkTruncateObject

export interface WriteChunkSeekObject {
  type: 'seek'
  position: number
}
export interface WriteChunkWriteObject {
  type: 'write'
  position?: number
  data: BufferSource | Blob | string
}

export interface WriteChunkTruncateObject {
  type: 'truncate'
  size: number
}
