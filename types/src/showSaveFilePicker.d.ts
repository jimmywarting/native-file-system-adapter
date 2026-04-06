export default showSaveFilePicker;
export type FileSystemFileHandle = import('./FileSystemFileHandle.js').default;
export type SaveFileMethod = 'native' | 'sw-transferable-stream' | 'sw-message-channel' | 'constructing-blob';
export function showSaveFilePicker(options?: {
    excludeAcceptAllOption?: boolean;
    types?: any[];
    suggestedName?: string;
    _preferredMethods?: SaveFileMethod[];
}): Promise<import("./FileSystemFileHandle.js").default>;
