const native: typeof globalThis.showSaveFilePicker | undefined = globalThis.showSaveFilePicker

export interface CustomSaveFilePickerOptions extends SaveFilePickerOptions {
  /** If you rather want to use the polyfill instead of the native implementation */
  _preferPolyfill?: boolean
  /** The name to fall back to when using polyfill */
  suggestedName?: string
}

export async function showSaveFilePicker (options: CustomSaveFilePickerOptions = {}): Promise<globalThis.FileSystemFileHandle> {
  if (native && !options._preferPolyfill) {
    return native(options)
  }

  const { FileSystemFileHandle } = await import('./FileSystemFileHandle.js')
  const { FileHandle } = await import('./adapters/downloader.js')
  return new FileSystemFileHandle(new FileHandle(options.suggestedName))
}

export default showSaveFilePicker
