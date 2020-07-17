export function fromDataTransfer(entries: any): Promise<import("./FileSystemDirectoryHandle.js").default>;
export function fromInput(input: any): Promise<import("./FileSystemFileHandle.js").default | import("./FileSystemDirectoryHandle.js").default | import("./FileSystemFileHandle.js").default[]>;
export namespace errors {
    export const INVALID: string[];
    export const GONE: string[];
    export const MISMATCH: string[];
    export const MOD_ERR: string[];
    export function SYNTAX(m: any): string[];
    export const SECURITY: string[];
    export const DISALLOWED: string[];
}
