export default showOpenFilePicker;
declare function showOpenFilePicker(options?: {
    multiple: boolean;
    excludeAcceptAllOption: boolean;
    accepts: any[];
    _preferPolyfill: boolean;
}): Promise<any>;
