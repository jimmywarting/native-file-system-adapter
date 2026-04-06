export default showOpenFilePicker;
export type FileSystemFileHandle = import('./FileSystemFileHandle.js').default;
export function showOpenFilePicker(options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    accepts?: any[];
    _preferredMethods?: ('native' | 'input')[];
}): Promise<FileSystemFileHandle[]>;
