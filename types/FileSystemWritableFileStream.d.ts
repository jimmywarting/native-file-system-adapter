export default FileSystemWritableFileStream;
declare const FileSystemWritableFileStream_base: any;
declare class FileSystemWritableFileStream extends FileSystemWritableFileStream_base {
    [x: string]: any;
    constructor(sink: any);
    private _closed;
    close(): any;
    seek(position: number): any;
    truncate(size: number): any;
    write(data: any): any;
}
