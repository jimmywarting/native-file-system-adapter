export default FileSystemDirectoryHandle;
declare class FileSystemDirectoryHandle extends FileSystemHandle {
    constructor(meta: any);
    getDirectoryHandle(name: string, options?: {
        create: boolean;
    }): Promise<FileSystemDirectoryHandle>;
    getEntries(): AsyncGenerator<FileSystemFileHandle | FileSystemDirectoryHandle, void, unknown>;
    getFileHandle(name: string, options?: {
        create: boolean;
    }): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: object): Promise<any>;
}
import FileSystemHandle from "./FileSystemHandle.js";
import FileSystemFileHandle from "./FileSystemFileHandle.js";
