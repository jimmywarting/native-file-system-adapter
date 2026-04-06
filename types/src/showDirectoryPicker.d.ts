export default showDirectoryPicker;
export type FileSystemDirectoryHandle = import('./FileSystemDirectoryHandle.js').default;
export function showDirectoryPicker(options?: {
    _preferredMethods?: ('native' | 'input')[];
}): Promise<FileSystemDirectoryHandle>;
