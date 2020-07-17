export default FileSystemHandle;
declare class FileSystemHandle {
    constructor(meta: any);
    kind: "file|directory";
    name: string;
    queryPermission(options?: {}): Promise<"denied" | "granted">;
    requestPermission(options?: {}): Promise<"denied" | "granted">;
}
