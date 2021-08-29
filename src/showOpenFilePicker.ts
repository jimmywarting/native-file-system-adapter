const native: typeof globalThis.showOpenFilePicker | undefined = globalThis.showOpenFilePicker

export interface FallbackAcceptsObject {
  extensions?: string[]
  mimeTypes?: string[]
}

export interface CustomOpenFilePickerOptions extends OpenFilePickerOptions {
  /** If you rather want to use the polyfill instead of the native implementation */
  _preferPolyfill?: boolean
  /** Accept options for input fallback */
  accepts?: FallbackAcceptsObject[]
}

export async function showOpenFilePicker (opts: CustomOpenFilePickerOptions = {}): Promise<globalThis.FileSystemFileHandle[]> {

  if (native && !opts._preferPolyfill) {
    return native(opts)
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = !!opts.multiple
  input.accept = (opts.accepts || [])
    .map(e => [
      ...(e.extensions || []).map(e => '.' + e),
      ...e.mimeTypes || []
    ])
    .flat()
    .join(',')

  // See https://stackoverflow.com/questions/47664777/javascript-file-input-onchange-not-working-ios-safari-only
  input.style.position = 'fixed'
  input.style.top = '-100000px'
  input.style.left = '-100000px'
  document.body.appendChild(input)

  const { makeFileHandlesFromFileList } = await import('./util.js')

  return new Promise(resolve => {
    input.addEventListener('change', () => {
      resolve(makeFileHandlesFromFileList(input.files!))
      document.body.removeChild(input)
    })
    input.click()
  })
}

export default showOpenFilePicker
