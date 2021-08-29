const native: typeof globalThis.showDirectoryPicker | undefined = globalThis.showDirectoryPicker

export interface CustomDirectoryPickerOptions extends DirectoryPickerOptions {
  /** If you rather want to use the polyfill instead of the native implementation */
  _preferPolyfill?: boolean
}

export async function showDirectoryPicker (options: CustomDirectoryPickerOptions = {}): Promise<globalThis.FileSystemDirectoryHandle> {
  if (native && !options._preferPolyfill) {
    return native(options)
  }

  const input = document.createElement('input')
  input.type = 'file'

  // Even with this check, the browser may support the attribute, but not the functionality (e.g. iOS Safari)
  if (!('webkitdirectory' in input)) {
    throw new Error(`HTMLInputElement.webkitdirectory is not supported`)
  }

  // @ts-ignore
  input.webkitdirectory = true

  // See https://stackoverflow.com/questions/47664777/javascript-file-input-onchange-not-working-ios-safari-only
  input.style.position = 'fixed'
  input.style.top = '-100000px'
  input.style.left = '-100000px'
  document.body.appendChild(input)

  const { makeDirHandleFromFileList } = await import('./util.js')

  return new Promise(resolve => {
    input.addEventListener('change', () => {
      resolve(makeDirHandleFromFileList(input.files!))
      document.body.removeChild(input)
    })
    input.click()
  })
}

export default showDirectoryPicker
