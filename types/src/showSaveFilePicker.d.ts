export default showSaveFilePicker;
export type FileSystemFileHandle = import('./FileSystemFileHandle.js').default;
export function showSaveFilePicker(options?: {
    excludeAcceptAllOption?: boolean;
    accepts?: any[];
    suggestedName?: string;
    _name?: string;
    _preferPolyfill?: boolean;
}): Promise<import("./FileSystemFileHandle.js").default>;
