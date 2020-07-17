export default showSaveFilePicker;
declare function showSaveFilePicker(options?: {
    excludeAcceptAllOption: boolean;
    accepts: any[];
    _name: string;
    _preferPolyfill: boolean;
}): Promise<any>;
