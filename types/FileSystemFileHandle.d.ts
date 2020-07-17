export default FileSystemFileHandle;
declare class FileSystemFileHandle extends FileSystemHandle {
    constructor(meta: any);
    createWritable(options?: any): Promise<FileSystemWritableFileStream>;
    getFile(): Promise<File>;
}
import FileSystemHandle from "./FileSystemHandle.js";
import FileSystemWritableFileStream from "./FileSystemWritableFileStream.js";
