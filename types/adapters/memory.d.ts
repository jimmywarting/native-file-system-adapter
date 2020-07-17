export class Sink {
    constructor(fileHandle: any);
    fileHandle: any;
    file: any;
    size: any;
    position: number;
    write(chunk: any): void;
    close(): void;
}
export class FileHandle {
    constructor(name: any, file: any, writable?: boolean);
    file: any;
    name: any;
    kind: string;
    deleted: boolean;
    writable: boolean;
    readable: boolean;
    getFile(): any;
    createWritable(opts: any): Sink;
    destroy(): void;
}
export class FolderHandle {
    constructor(name: any, writable?: boolean);
    name: any;
    kind: string;
    deleted: boolean;
    entries: {};
    writable: boolean;
    readable: boolean;
    getEntries(): AsyncGenerator<any, void, undefined>;
    getDirectoryHandle(name: any, opts?: {}): any;
    getFileHandle(name: any, opts?: {}): any;
    removeEntry(name: any, opts: any): void;
    destroy(recursive: any): void;
}
declare function _default(opts: any): FolderHandle;
export default _default;
