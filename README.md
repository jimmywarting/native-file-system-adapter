# native-file-system adapter (polyfill)

> This is an in-browser file system that follows [native-file-system](https://wicg.github.io/native-file-system/) and supports storing and retrieving files from various backends.

### Adapters

This polyfill/ponyfill ships with 4 filesystem backends:

* `native`: Stores files the `Native Sandboxed` file storage
* `Sandbox`: Stores files into the Blinks `Sandboxed FileSystem` API.
* `IndexedDB`: Stores files into the browser's `IndexedDB` object database.
* `Memory`: Stores files in-memory. Thus, it is a temporary file store that clears when the user navigates away.


The api is designed in such a way that it can work with or without the ponyfill if you choose to remove or add this
It's not trying to interfear with the chaning spec by using other arguments/properties that may conflict with the feature changes to the spec

( The current minium supported browser I have choosen to support is the ones that can handle import/export )
( Some parts are lazy loaded when needed )

### Using

```html
<script src="https://cdn.jsdelivr.net/npm/web-streams-polyfill@2.1.0/dist/ponyfill.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/streamsaver@2.0.3/StreamSaver.min.js"></script>
<script type=module src="your_code.js"></script>
```

```js
import { chooseFileSystemEntries, FileSystemDirectoryHandle } from 'https://cdn.jsdelivr.net/gh/jimmywarting/native-file-system-adapter/src/es6.js'

// pick a file
const fileHandle = await chooseFileSystemEntries({
  type: 'openFile', // default
  accepts: [
    { extensions: ['jpg'] },
    { extensions: ['webp'] },
    { mimeTypes: ['image/png'] }
  ],
  multiple: false, // default
  excludeAcceptAllOption: false, // default
  _preferPolyfill: false // default
})

const file = await fileHandle.getFile()

// store a file
const folderHandle = await FileSystemDirectoryHandle.getSystemDirectory({
  type: 'sandbox',
  _driver: 'native', // native|sandbox|memory|indexeddb
  _persistent: true, // option for when using blink's sandboxed storage (default=temporary)
})

const fileHandle = await folderHandle.getFile(file.name, { create: true })
await fileHandle.write(file)

// save/download a file
const fileHandle = await chooseFileSystemEntries({
  type: 'saveFile'
  accepts: [
    { extensions: ['jpg'] },
    { extensions: ['webp'] },
    { mimeTypes: ['image/png'] }
  ],
  excludeAcceptAllOption: true,
  _preferPolyfill: false,
  _name: 'Untitled.png',
})

const extensionChosen = fileHandle.name.split('.').pop()

const image = {
  jpg: generateCanvas({ type: 'blob', format: 'jpg' }),
  png: generateCanvas({ type: 'blob', format: 'png' }),
  webp: generateCanvas({ type: 'blob', format: 'webp' })
}[extensionChosen]

await image.stream().pipeTo(fileHandle.getWriter())
```

PS: storing a file handle in IndexedDB or sharing it with postMessage isn't currently possible.


### A note when downloading with the polyfilled version

I'm barly mimicing what the native version can do. But plan to imporove it a bit later.

Saving/downloading a file utilize [StreamSaver.js](https://github.com/jimmywarting/StreamSaver.js) when saving file to the disk, So you can write large files.
So it have to be probably setup first if you want to use this functionallity.

You can't seek or truncate a file. You have to write the data in sequental order as a Readable byte stream

You can't write blob/files/strings/arraybuffer as you can do with the native version (yet)

I'm planning on maybe incopirate some of StreamSaver's functionallity to this lib. But for now it gets the job done.

-----

If you have chosen to `openDirectory` when the polyfilled version is in use (`input[webkitdirectory]`)
than you can't get any write access to it. So unless you are using chanary with experimental flags or enabled the [Origin Trials](https://github.com/GoogleChrome/OriginTrials/blob/gh-pages/developer-guide.md) for beta testing on your origin, then you better use `saveFile` instead to be safe.

### Testing

start up a server and open `/examples/test.html` in your browser.

### Resources

I recommend to follow up on this links for you to learn more about the API and how it works

- https://web.dev/native-file-system/
- https://wicg.github.io/native-file-system/
- https://github.com/wicg/native-file-system

### License

native-file-system polyfill is licensed under the MIT License. See `LICENSE` for details.
