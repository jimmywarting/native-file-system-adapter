export default showDirectoryPicker;
export type FileSystemDirectoryHandle = import('./FileSystemDirectoryHandle.js').default;
export function showDirectoryPicker(options?: {
    /** @deprecated Use _preferredMethods instead */
    _preferPolyfill?: boolean;
    _preferredMethods?: ('native' | 'input')[];
}): Promise<FileSystemDirectoryHandle>;
