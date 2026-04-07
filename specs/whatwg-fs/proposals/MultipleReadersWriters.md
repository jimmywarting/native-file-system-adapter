# New Locking Scheme to Enable Multiple Readers and Writers

## Authors

* Daseul Lee (dslee@chromium.org)

## Participate

* [Issue Tracker](https://github.com/whatwg/fs/issues)
* [Discussion Forum](https://github.com/whatwg/fs/issues/34)

## Introduction

Currently, only one instance of [FileSystemSyncAccessHandle](https://fs.spec.whatwg.org/#api-filesystemsyncaccesshandle) may be open at a time, given a [file system entry](https://fs.spec.whatwg.org/#entry). This explainer proposes a new locking scheme and API changes to support multiple readers and writers for `FileSystemSyncAccessHandle` and an exclusive writer for `FileSystemWritableFileStream`.

Introducing new locking modes for [FileSystemSyncAccessHandle](https://fs.spec.whatwg.org/#api-filesystemsyncaccesshandle) and [FileSystemWritableFileStream](https://fs.spec.whatwg.org/#api-filesystemwritablefilestream) allows opening either multiple readers/writers or an exclusive writer to a file entry, depending on the application's use case.

```
handle.createSyncAccessHandle({ mode: 'read-only' });
handle.createSyncAccessHandle({ mode: 'readwrite-unsafe' });

handle.createWritable({ mode: 'exclusive' });
```

## Goals

* Support multiple readers and writers for `FileSystemSyncAccessHandle`
* Support exclusive writer for `FileSystemWritableFileStream`
* Ensure operations which modify a file or directory cannot clobber each other

## Non-goals

* Opening `FileSystemSyncAccessHandle` with no restrictions
* Support Posix-like file locking primitives

## Motivating Use Cases

### Write Once, Read Many
A text editor app provides version control, and keeps metadata as a local file in the Bucket File System. This metadata file has a map of version history, so the app does not want this file to be written while it’s being read to load the file contents from a correct version, from multiple tabs.
Using “read-only” mode, `FileSystemSyncAccessHandle` can be opened for this metadata file, and any overwriting would be disallowed. The app would not need to provide its own locking mechanism.

### Caching large files
An image editor app wants to store large media files in the Bucket File System using `FileSystemSyncAccessHandle` so that image files do not need to be downloaded again when the user opens the app from multiple tabs.

Currently, each time the app is open, it needs to coordinate closing the existing `FileSystemSyncAccessHandle` and opening a new one via a dedicated worker.

With multiple readers, the site can easily load images from multiple tabs, without additional network cost.

### Mitigate performance overhead from asynchronous open
A database ported to Wasm wants to mitigate performance issues caused by the asynchronous `createSyncAccessHandle()` method.

For use cases with a known set of files, the performance cost of going async from Wasm can be mitigated if multiple `FileSystemSyncAccessHandle` are opened up front. After bearing the one-time cost of these asynchronous calls, the application can interact with the files fully synchronously. 

### Allow applications to provide its own granular access scheme for FileSystemSyncAccessHandles
An application may want to define its own locking mechanism, such as byte-range locking, to provide more granular access.

This is currently not possible as only one `FileSystemSyncAccessHandle` is allowed at a time. With multiple handles, advanced applications can provide data access protection via its own implementation of lock or [SharedArrayBuffers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) with [Atomics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics).

### Provide an alternative to the last-writer-wins behavior of FileSystemWritableFileStream
Currently, multiple `FileSystemWritableFileStream` writers can be opened at the same time, but only the last writer wins, as the data gets flushed when the writer is closed. Some applications using `FileSystemWritableFileStream` to write local files may prefer to have API-provided locking behavior.

Introducing an “exclusive” mode for `FileSystemWritableFileStream` would prevent writers clobbering each other.

## Modes of Creating a FileSystemSyncAccessHandle
Currently, opening multiple `FileSystemSyncAccessHandle` fails with a `NoModificationAllowedError`, taking an exclusive lock on a file entry. 

Allowing concurrent access to a file could provide flexibility and performance improvement for apps. In some cases, sites may need to do read-only operation and still prefer to have the data access protection provided by the API (i.e. site from another tab is not writing to the same file, while it is being read). In other cases, a site may be okay with concurrent writes and could deal with the data race at the application-level. To accommodate different use cases, a new mode will be specified when opening a `FileSystemSyncAccessHandle`.

```
enum FileSystemSyncAccessHandleMode { 
  "readwrite", 
  "read-only",
  "readwrite-unsafe",
};

dictionary FileSystemCreateSyncAccessHandleOptions {
  FileSystemSyncAccessHandleMode mode = "readwrite";
};

interface FileSystemFileHandle : FileSystemHandle {
  ...
  Promise<FileSystemSyncAccessHandle> createSyncAccessHandle(
    optional FileSystemCreateSyncAccessHandleOptions options = {});
};

interface FileSystemSyncAccessHandle {
  ...
  readonly attribute USVString mode; // available via attribute
};
```

`readwrite` mode
* Once open, any methods on `FileSystemSyncAccessHandle` are allowed.
* Only one instance of `FileSystemSyncAccessHandle` is allowed.
* This mode is the current behavior that allows safe data access, therefore is the default mode.

`read-only` mode (multiple readers)
* Once open, only read-like methods on `FileSystemSyncAccessHandle` are allowed: `read()`, `getSize()`, `close()`
* Multiple instances of `FileSystemSyncAccessHandle` may be created as long as all of them are in `read-only` mode.

`readwrite-unsafe` mode (multiple writers)
* Once open, any methods on `FileSystemSyncAccessHandle` are allowed.
* Multiple instances of `FileSystemSyncAccessHandle` may be created as long as all of them are in `readwrite-unsafe` mode.

The current behavior is preserved by keeping the `readwrite` option as the default, which only allows one instance at a time. If a site needs to open multiple sync access handles but does not need to perform writes, then the `read-only` option should be used. Finally, the last option `readwrite-unsafe` allows multiple instances as well as both read and write. In this case, writes can be racy if performed from multiple tabs, and sites would need to provide their own locking scheme. 

See the examples below:

```js
// 'readwrite' SyncAccessHandle is open; no other lock-requiring operations are allowed until the handle is closed.
const accessHandle = await handle.createSyncAccessHandle({mode: 'readwrite'});
accessHandle.write(buffer); // successful
accessHandle.read(buffer); // successful

await handle.createSyncAccessHandle({mode: 'readwrite'}); // throws NoModificationAllowedError
await handle.createSyncAccessHandle({mode: 'read-only'}); // throws NoModificationAllowedError
await handle.createSyncAccessHandle({mode: 'readwrite-unsafe'}); // throws NoModificationAllowedError
```

```js
// 'read-only' SyncAccessHandle is open; besides opening another read-only SyncAccessHandle,
// no other lock-requiring operations are allowed until the handle is closed.
const accessHandle1 = await handle.createSyncAccessHandle({mode: 'read-only'});
accessHandle1.write(buffer); // throws NoModificationAllowedError
accessHandle1.read(buffer); // successful
const accessHandle2 = await handle.createSyncAccessHandle({mode: 'read-only'});

await handle.createSyncAccessHandle({mode: 'readwrite'}); // throws NoModificationAllowedError
await handle.createSyncAccessHandle({mode: 'readwrite-unsafe'}); // throws NoModificationAllowedError

accessHandle1.close(); // only one lock released
await handle.createSyncAccessHandle({mode: 'readwrite'}); // still throws NoModificationAllowedError

accessHandle2.close(); // all locks released
await handle.createSyncAccessHandle({mode: 'readwrite'}); // successful
```

```js
// 'readwrite-unsafe' SyncAccessHandle is open; besides opening another 'readwrite-unsafe' SyncAccessHandle,
// no other lock-requiring operations are allowed until the handle is closed.
const accessHandle1 = await handle.createSyncAccessHandle({mode: 'readwrite-unsafe'});
accessHandle1.write(buffer); // successful
accessHandle1.read(buffer); // successful
const accessHandle2 = await handle.createSyncAccessHandle({mode: 'readwrite-unsafe'});

await handle.createSyncAccessHandle({mode: 'readwrite'}); // throws NoModificationAllowedError
await handle.createSyncAccessHandle({mode: 'readonly'}); // throws NoModificationAllowedError

accessHandle1.close(); // only one lock released
await handle.createSyncAccessHandle({mode: 'readwrite'}); // still throws NoModificationAllowedError

accessHandle2.close(); // all locks released
await handle.createSyncAccessHandle({mode: 'readwrite'}); // successful
```

## Modes of Creating a FileSystemWritableFileStream
Unlike `FileSystemSyncAccessHandle`, many instances of `FileSystemWritableFileStream` can be created per file entry. To provide an option for an exclusive writer, a similar mode will be added to `FileSystemCreateWritableOptions`.

```
enum FileSystemWritableFileStreamMode { 
  "exclusive", // Only one writer can exist at a time
  "siloed",    // Each writer created will have its own swap file
};

dictionary FileSystemCreateWritableOptions {
  ...
  FileSystemWritableFileStreamMode mode;
};
```

## Changes to Locking Scheme

### Locking Within Primitive & Across Primitive/Operations
In the File System Access API, there are two lock types: “shared” and “exclusive”. Acquiring a lock is required for performing operations on a [FileSystemHandle](https://fs.spec.whatwg.org/#api-filesystemhandle) and for using file primitives: `FileSystemSyncAccessHandle` and `FileSystemWritableFileStream`. As the name suggests, at most one exclusive lock can be taken at a time given a file entry, and multiple shared locks can be taken at a time. `FileSystemWritableFileStream` requires a shared lock, while the rest requires an exclusive lock.

```
FileSystemAccessFileHandle.createWritable()*            Shared
FileSystemAccessFileHandle.createSyncAccessHandle()*    Exclusive
FileSystemAccessFileHandle/DirectoryHandle.move()**     Exclusive
FileSystemAccessFileHandle/DirectoryHandle.remove()**   Exclusive
FileSystemAccessDirectoryHandle.removeEntry()**         Exclusive
```

\* The lock is released when the file primitive is closed.

\** The lock is released when the operation completes.

To support multiple readers and writers, simply switching to the shared lock for both `readonly` and `readwrite-unsafe` modes does not work because there is no way to enforce the exclusivity between different access modes. And what if `FileSystemWritableFileStream` is open, holding the shared lock already? It may cause unexpected behavior if the site intended to create multiple readers of `FileSystemSyncAccessHandle` for safe reading. 

There are two dimensions to consider:

1) Across different types of primitives and operations
    * Only one type of primitive can be opened at a time
    * Any modifying operation (that requires a lock, as listed above) on a `FileSystemHandle` is allowed only if there is no open primitive, and vice versa.
2) Within the primitive
    * A “mode” specifies whether to allow only one or multiple instances of the same primitive type, and how they may be used

In the new locking scheme, these two dimensions will be specified as “lock type” and “lock mode”. Lock type refers to the type of primitive or operation, in order to enforce exclusive lock between them. Lock mode refers to whether the access to a file entry could be shared within the same type of primitive.

For example, read-only `FileSystemSyncAccessHandle` would take LockType of “sync-access-handle”, which prevents other primitives or operations to perform, and LockMode of “shared-read-only”, which lets multiple readers of `FileSystemSyncAccessHandle` to be created.

```js
const accessHandle1 = await handle.createSyncAccessHandle({mode: 'read-only'});
const accessHandle2 = await handle.createSyncAccessHandle({mode: 'read-only'});

await handle.move('target.txt'); // throws NoModificationAllowedError
await handle.createWritable(); // throws NoModificationAllowedError

accessHandle1.close();
accessHandle2.close();

await handle.move('target.txt'); // successful
await handle.createWritable(); // successful
```

### Preventing Modification of Parents
A file should not be able to be moved or removed if it has an open `FileSystemSyncAccessHandle` or `FileSystemWritableFileStream`. Accordingly, the file’s parents should not be movable or removable, either.

```js
const childHandle = parentHandle.getFileHandle("foo.txt");
const childAccessHandle = await childHandle.createSyncAccessHandle({mode: 'readwrite'});

await parentHandle.remove(); // throws NoModificationAllowedError
childAccessHandle.close();
await parentHandle.remove(); // successful
```

### Interactions with BFCache
A page may still hold a file system lock when it enters the BFCache. A fully active page could then be made aware of a BFCached page if there is contention between locks they hold.

To keep BFCache enabled when a site uses the File System Access API, a BFCached page must be evicted on locking contention with a fully active page (whether or not it is of the same origin). Otherwise, a file system lock held by a page will not affect the page's eligibility for BFCache. This allows the site to have the performance gains of BFCache up until it would be made aware of the BFCache.

## Alternatives Considered

### Not Locking File Entry
Not locking a file entry is one way to support multiple readers and writers. The argument for this is that in the Bucket File System, an origin is the only one accessing its own local files and could choose to provide its own locking mechanism, without help from the browser. However, this would make it much easier to improperly use this API; web developers often [prefer protective behaviors from the file system](https://github.com/whatwg/fs/issues/34#issuecomment-1248731620).

### Specifying lock, write and access modes separately
whatwg/fs#19 suggests specifying lock, write and access modes separately (vs. one type of mode, associating access and lock behavior together).

This approach provides more flexibility for applications in wanting to choose a specific behavior. However, some combinations are not valid, such as “exclusive + read-only”. Also, exposing the concept of lock at the API-level might be confusing to users. Multiple `FileSystemWritableFileStream` writers are already allowed, so does “shared” `FileSystemSyncAccessHandle` mean that it holds a shared lock within `FileSystemSyncAccessHandle` primitive type, or across all File System Access primitives? This ambiguity could be confusing to the end users. Finally, it’s not clear how a “shared” access mode would interact with ”atomic-from-copy” write mode (i.e. swap file).

### Support multiple readers, but not multiple writers
A concern around multiple writers is error-prone usage, resulting in racy writes. Applications would be responsible for preventing and/or handling data races caused by concurrent writes, presumably using SharedArrayBuffer and Atomics.

On the other hand, the main benefits and arguments for multiple writers are the following:

* It’s very common for web apps to be run on multiple tabs
* [Mitigate performance overhead from asynchronous open](#mitigate-performance-overhead-from-asynchronous-open)
* [Emscripten intends to use both multiple readers and writers](https://github.com/whatwg/fs/issues/34#issuecomment-1212609690)

### Defining all operations as readonly or readwrite
As a way to redesign the locking scheme that supports multiple readers, whatwg/fs#34 suggests defining all operations of File System Access API as either “readonly” or “readwrite”, and allow them to be queued. For example, if a file entry does not have any operation, a read or write operation can start. If there is a read operation, only another read operation can start but a write operation will wait; if there is a write operation, all other operations will wait. This idea was dismissed as it would introduce breaking changes to the API, by adding a lock to `FileSystemFileHandle.getFile()`, which currently does not have any locking restrictions. In addition, `getFile()` returns a readable `File` object. Unlike `FileSystemSyncAccessHandles`, `FileSystemWritableFileStreams`, or file-modifying methods such as `move()`, a `File` object does not have a clear open and close lifetime. It is not clear when the lock could be released. Finally, it would also close the door for supporting multiple writers in the future.

### Byte-range locking with one writer
Instead of allowing multiple writers, the API could provide byte-range locking on a single writer. However, this would add a lot of complexity for something with an unclear impact on performance. “readwrite-unsafe” mode will allow sites to implement their own byte-range locking, if they wish to have more granular locking control. 

### Not Locking Parents
Without parent directory locking, a directory could be moved or removed while there is an open writer, which may not be the application's intention. Locking parents is currently unspecified. Recently, whatwg/fs/pull/96 specifies that FileSystemHandle is associated with a file path. Therefore, it makes sense to assume that applications intend to edit the file at the path that the `FileSystemSyncAccessHandle` was initially opened at.

## Stakeholder Feedback / Opposition
* Developers: [Positive](https://github.com/whatwg/fs/issues/34)
* Gecko: [Positive with regards to allowing multiple FileSystemSyncAccessHandles. Stance on the shape of this specific proposal is not yet known.](https://github.com/whatwg/fs/issues/34)
* Webkit: [Positive with regards to allowing multiple read-only FileSystemSyncAccessHandles. Stance on the shape of this specific proposal is not yet known.](https://github.com/whatwg/fs/issues/34)
