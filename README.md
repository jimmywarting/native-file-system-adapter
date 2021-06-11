# Native File System adapter (ponyfill)

What is this?

This is file system that follows [native-file-system](https://wicg.github.io/native-file-system/) specification. Thanks to it we can have a unified way of handling data in all browser and even in NodeJS in a more secure way.

At a high level what we're providing is several bits:

1. A modernized version of `FileSystemFileHandle` and `FileSystemDirectoryHandle` interfaces.
2. A modernized version of `FileSystemWritableFileStream` to truncate and write data.
3. A way to not only use one location to read & write data to and from, but several other sources called adapters

### Adapters

This polyfill/ponyfill ships with a few backends built in:

* `node`: Interact with filesystem using nodes `fs`
* `native`: Stores files the `Native Sandboxed` file file system storage
* `Sandbox`: Stores files into the Blinks `Sandboxed FileSystem` API.
* `IndexedDB`: Stores files into the browser's `IndexedDB` object database.
* `Memory`: Stores files in-memory. Thus, it is a temporary file store that clears when the user navigates away.
* `Cache storage`: Stores files in cache storage like a request/response a-like.

You can even load in your own underlying adapter and get the same set of API's

The api is designed in such a way that it can work with or without the ponyfill if you choose to remove or add this.<br>
It's not trying to interfere with the changing spec by using other properties that may conflict with the feature changes to the spec.

( The current minium supported browser I have chosen to support is the ones that can handle import/export )<br>
( Some parts are lazy loaded when needed )

### Using

```js
import {
  showDirectoryPicker,
  showOpenFilePicker,
  showSaveFilePicker,
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
  FileSystemWritableFileStream,
  getOriginPrivateDirectory
} from 'https://cdn.jsdelivr.net/gh/jimmywarting/native-file-system-adapter/src/es6.js'

// the getOriginPrivateDirectory is a legacy name that
// native filesystem added, have not bother to change it

// same as calling navigator.storage.getDirectory()
handle = await getOriginPrivateDirectory()
// A write only adapter to save files to the disk
handle = await getOriginPrivateDirectory(import('../src/adapters/downloader.js'))
// Blinks old sandboxed api
handle = await getOriginPrivateDirectory(import('../src/adapters/sandbox.js'))
// fast in-memory file system
handle = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))
// Using indexDB
handle = await getOriginPrivateDirectory(import('../src/adapters/indexeddb.js'))
// Store things in the new Cache API as request/responses (bad at mutating data)
handle = await getOriginPrivateDirectory(import('../src/adapters/cache.js'))

// Node only variant:
handle = await getOriginPrivateDirectory(import('native-file-system-adapter/src/adapters/memory.js'))
handle = await getOriginPrivateDirectory(import('native-file-system-adapter/src/adapters/node.js'), './starting-path')



// The polyfilled (file input) version will turn into a memory adapter
// You will have read & write permission on the memory adapter,
// you might want to transfer (copy) the handle to another adapter
showOpenFilePicker({_preferPolyfill: boolean, ...sameOpts}).then(fileHandle => {})
showDirectoryPicker({_preferPolyfill: boolean, ...sameOpts}).then(directoryHandle => {})

// Supports drag and drop also
window.ondrop = evt => {
  evt.preventDefault()
  for (let item of evt.dataTransfer.items) {
    item.getAsFileSystemHandle(handle => {
      console.log(handle)
    })
  }
}

// request user to select a file
const fileHandle = await showOpenFilePicker({
  types: [], // default
  multiple: false, // default
  excludeAcceptAllOption: false, // default
  _preferPolyfill: false // default
})

// returns a File Instance
const file = await fileHandle.getFile()

// copy the file over to a another place
const rootHandle = await getOriginPrivateDirectory()
const fileHandle = await rootHandle.getFileHandle(file.name, { create: true })
await fileHandle.write(file)
fileHandle.close()

// save/download a file
const fileHandle = await showSaveFilePicker({
  _preferPolyfill: false,
  suggestedName: 'Untitled.png',
  types: [
    { accept: { "image/png": [ "png" ] } },
    { accept: { "image/jpg": [ "jpg" ] } },
    { accept: { "image/webp": [ "webp" ] } }
  ],
  excludeAcceptAllOption: false // default
})

// Look at what extension they chosen
const extensionChosen = fileHandle.name.split('.').pop()

const blob = {
  jpg: generateCanvasBlob({ type: 'blob', format: 'jpg' }),
  png: generateCanvasBlob({ type: 'blob', format: 'png' }),
  webp: generateCanvasBlob({ type: 'blob', format: 'webp' })
}[extensionChosen]

await blob.stream().pipeTo(fileHandle.getWriter())
// or
var writer = fileHandle.getWriter()
writer.write(blob)
writer.close()
```

PS: storing a file handle in IndexedDB or sharing it with postMessage isn't currently possible unless you use native.
Will get to it at some point in the feature

### A note when downloading with the polyfilled version

Saving/downloading a file borrowing some of ideas from [StreamSaver.js](https://github.com/jimmywarting/StreamSaver.js).
The difference is:
 - Using service worker is optional choice with this adapter.
 - It dose not rely on some man-in-the-middle or external hosted service worker.
 - If you want to stream large data to the disk directly instead of taking up much RAM you need to set up a service worker yourself.<br>(note that it requires https - but again worker is optional)
 - You don't have to handle web-streams-polyfills it's lazy loaded when needed when you need that writable stream. 😴

to set up a service worker you have to basically copy [the example](https://github.com/jimmywarting/native-file-system-adapter/tree/master/example/sw.js) and register it:

```js
navigator.serviceWorker.register('sw.js')
```

Without service worker you are going to write all data to the memory and download it once it closes.

Seeking and truncating won't do anything. You should be writing all data in sequential order when using the polyfilled version.

### Testing

- start up a server and open `/examples/test.html` in your browser.
- for node: `npm i && npm run test`

### Resources

I recommend to follow up on this links for you to learn more about the API and how it works

- https://web.dev/native-file-system/
- https://wicg.github.io/native-file-system/
- https://github.com/wicg/native-file-system

### Alternatives
- [browser-fs-access](https://github.com/GoogleChromeLabs/browser-fs-access) by [@tomayac](https://github.com/tomayac): A similar, more like a shim (without `getSystemDirectory`).
- [StreamSaver](https://github.com/jimmywarting/StreamSaver.js) by [@jimmywarting](https://github.com/jimmywarting): A way to save large data to the disk directly with a writable stream <br><small>(same technique can be achieved if service worker are setup properly)</small>
- [FileSaver](https://github.com/eligrey/FileSaver.js) by [@eligrey](https://github.com/eligrey): One among the first libs to save blobs to the disk

### License

native-file-system-adapter is licensed under the MIT License. See `LICENSE` for details.
