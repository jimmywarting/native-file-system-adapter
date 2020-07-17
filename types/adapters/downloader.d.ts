export class FileHandle {
    constructor(name: any, file: any);
    name: any;
    kind: string;
    getFile(): void;
    createWritable(opts: any): Promise<WritableStreamDefaultWriter<any> | {
        write(chunk: any): void;
        close(something: any): void;
    }>;
}
