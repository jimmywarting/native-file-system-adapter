export default showSaveFilePicker;
export type FileSystemFileHandle = import('./FileSystemFileHandle.js').default;
export type SaveFileMethod = 'native' | 'sw-transferable-stream' | 'sw-message-channel' | 'constructing-blob';
export function showSaveFilePicker(options?: {
    excludeAcceptAllOption?: boolean;
    types?: any[];
    suggestedName?: string;
    /** @deprecated Use _preferredMethods instead */
    _preferPolyfill?: boolean;
    _preferredMethods?: SaveFileMethod[];
}): Promise<import("./FileSystemFileHandle.js").default>;
