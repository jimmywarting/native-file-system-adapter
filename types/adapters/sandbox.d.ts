export class FileHandle {
    constructor(file: any, writable?: boolean);
    file: any;
    kind: string;
    writable: boolean;
    readable: boolean;
    get name(): any;
    getFile(): Promise<any>;
    createWritable(opts: any): Promise<any>;
}
export class FolderHandle {
    constructor(dir: any, writable?: boolean);
    dir: any;
    writable: boolean;
    readable: boolean;
    kind: string;
    name: any;
    getEntries(): AsyncGenerator<FileHandle | FolderHandle, void, unknown>;
    getDirectoryHandle(name: any, opts?: {}): Promise<any>;
    getFileHandle(name: any, opts?: {}): Promise<any>;
    removeEntry(name: any, opts: any): Promise<any>;
}
declare function _default(opts?: {}): Promise<any>;
export default _default;
