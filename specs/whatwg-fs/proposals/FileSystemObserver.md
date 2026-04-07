# The FileSystemObserver Interface

## Authors

*   [Austin Sullivan](asully@chromium.org) (Google)

## Participate

*   [Issue tracker](https://github.com/whatwg/fs/issues)

## Introduction

The file system is a shared resource that can be modified from several contexts. A [Bucket File System](https://fs.spec.whatwg.org/#sandboxed-filesystem) spans numerous [agents](https://tc39.es/ecma262/#sec-agents) - tabs, workers, etc - within the same [storage key](https://storage.spec.whatwg.org/#storage-keys). The local file system also spans across origins and other applications on the host operating system.

For a given agent to know about modifications to the file system - made either by itself or from some external context - it can currently poll the file system to detect changes. This is inefficient and does not scale well.

This explainer proposes a `FileSystemObserver` interface which will much more easily allow a website to be notified of changes to the file system.

## Goals

*   Simplify application logic and improve the ergonomics of watching file paths
*   Improve the efficiency of watching file paths on the local file system
*   Provide best-effort information of changes to the local file system
*   Guarantee consistent behavior across platforms with regards to the contents of a file system change record for a corresponding change to a Bucket File System

## Non-Goals

*   Expose any information to the web that isn’t already exposed
*   Expand the permissions of a website as a result of a file system change
*   Provide notification of changes that occur outside the scope of a `FileSystemObserver` connection (e.g. before the `FileSystemObserver` is created or after the tab is closed)
*   Guarantee that all file system changes which occur while a `FileSystemObserver` is connected are reported. See [Guaranteeing that Changes are Not Missed](#guaranteeing-that-changes-are-not-missed)
*   Guarantee consistent behavior across platforms with regards to the contents of a file system change record for a corresponding change to the local file system. See [Cross Platform Compatibility](#cross-platform-compatibility)

## Use Cases

*   [Binding a UI element](https://web.dev/indexeddb-uidatabinding/) to the contents of a file
*   Notifying the main thread of file system changes from a worker or another tab
*   Syncing file system changes to a server
*   [Implementing an in-memory](https://github.com/WICG/indexed-db-observers/blob/gh-pages/EXAMPLES.md#maintaining-an-in-memory-data-cache) cache to speed up file system operations

## Key Scenarios

### Observing Changes to a File

To implement a website that [binds a UI element](https://web.dev/indexeddb-uidatabinding/) to the contents of the file, the website must watch for changes to the file in order to trigger corresponding changes to the UI. Currently, the website has two options for watching file system changes:

*   Set up a [`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel) and add hooks to broadcast a message on every file system operation. Note that while this approach is plausible for tracking changes to the Bucket File System, it is oblivious to changes made to the local file system external to your origin
*   Poll the file system. This is the only way to track changes made external to your origin

The example below shows a rudimentary implementation of file system polling. The website can read the last-modified timestamp of the file through the [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) interface. The value of `pollInterval` strongly dictates both the resource consumption (if it's too frequent) and responsiveness (if it's not frequent enough) of the website.

```javascript
// Current approach to detect changes, using polling

while (true) {
  await sleep(pollInterval);
  const file = await fileHandle.getFile();
  const timestamp = file.lastModified;
  if (timestamp > lastKnownTimestamp) {
    lastKnownTimestamp = timestamp;
    await readFileAndUpdateUI(file);
  }
}
```

A `FileSystemObserver` allows changes to the file to be observed with much more simple application logic, without requiring the website author to consider the resource consumption vs. responsiveness tradeoff. When the observed file changes, the website will receive a `FileSystemChangeRecord` including details about the file system change.

```javascript
// Same as above, but using the proposed FileSystemObserver

const callback = async (records, observer) => {
  // Will be run when the observed file changes.

  // The change record includes a handle detailing which file has
  // changed, which in this case corresponds to the observed handle.
  const changedFileHandle = records[0].changedHandle;
  assert(await fileHandle.isSameEntry(changedFileHandle));

  // Since we're observing changes to a file, the `root` of the change
  // record also corresponds to the observed file.
  assert(await fileHandle.isSameEntry(records[0].root));

  readChangesAndUpdateUI(changedFileHandle);
}

const observer = new FileSystemObserver(callback);
await observer.observe(fileHandle);
```

This is especially useful for changes made via the [`FileSystemSyncAccessHandle`](https://fs.spec.whatwg.org/#api-filesystemsyncaccesshandle) interface - a high-performance file primitive that can only be used from a [dedicated worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API). The website can create a `FileSystemObserver` on the main thread to listen to changes made from the worker.

```javascript
// Using an observer on the main thread to listen to changes made by a worker

// index.js
const callback = (records, observer) => {
  // Will be run when there are changes to observed files.
  readChangesAndUpdateUI(records);
}

const observer = new FileSystemObserver(callback);
await observer.observe(fileHandle);
askWorkerToWriteSomeData(fileHandle, someData);

// worker.js
const syncAccessHandle = await dbFileHandle.createSyncAccessHandle();
syncAccessHandle.write(someData);  // Triggers a change record
```

### Observing Changes to a Directory

Unlike files, directories contain children - and some of these children are themselves directories which contain yet more children. Given that there exist use cases for both non-recursive (i.e. first-level) and recursive directory watches and that the [resource consumption](#resource-constraints) of recursive directory watches can be exponentially higher than non-recursive directory watches on some platforms, the proposed API allows for directory watches to be either non-recursive or recursive.

#### Observing a Directory Non-Recursively

A user grants a web image editor access to a folder containing some photos. When the user adds a new photo to the folder, they expect the website to detect the presence of the new file.

Checking for updates to a directory requires enumerating each of the entries within the directory to compare its last-modified timestamp to the last-known timestamp for the file. If the folder is large, there may not exist a value of `pollInterval` which provides the desired responsiveness

```javascript
// Current approach to detect changes to a directory's children, using polling

let timestamps = {};  // { fileName: timestamp, ... }

while (true) {
  await sleep(pollInterval);
  // Enumerate the directory and check timestamps for each child
  for await (const handle of directoryHandle.values()) {
    checkIfChanged(handle);
    // ...
  }
  // ...
}
```

Note that if it was possible to read the last-modified time for a directory (see https://github.com/whatwg/fs/issues/12), this could be optimized by only enumerating the directory if its timestamp has changed. However, detecting _which_ file was added would still require enumerating the directory.

The `FileSystemObserver` interface allows the website to be responsive to changes even for large directories which are not feasible to poll.

```javascript
// Same as above, but using a FileSystemObserver

const callback = (records, observer) => {
  // Non-recursively watching a directory will only report changes to
  // immediate children of the observed directory.
  handleChanges(records);
}

const observer = new FileSystemObserver(callback);
const options = { recursive: false };  // Default is false.
await observer.observe(directoryHandle, options);
```

#### Observing a Directory Recursively

A user grants a web IDE access to the source folder of a local repository. If the user makes changes to files or directories in the repository via some other application on the machine (e.g. with Vim) while the web application is running, they expect the web application’s UI to show a “dirty” indicator.

There are a number of issues when attempting to track these changes by polling the file system:

*   Tracking changes to subdirectories exacerbates the challenges of scaling polling. It is even more likely there will not exist a polling interval which provides the desired responsiveness
*   Recursively enumerating a directory is currently not trivial. See https://github.com/whatwg/fs/issues/15
*   Checking whether a directory (or file, for that matter) exists is currently not trivial. See https://github.com/whatwg/fs/issues/80
*   Checking the last-modified timestamp of a directory is currently impossible. See https://github.com/whatwg/fs/issues/12

Passing the `recursive: true` option to the `FileSystemObserver.observe()` method’s `options` dictionary expands the scope of the observation to include changes within subdirectories. Here again, the website can be responsive to changes even while recursively watching large directories.

```javascript
// Detecting changes to a directory recursively with a FileSystemObserver

const callback = (records, observer) => {
  // Recursively watching a directory will report changes to both
  // children and all subdirectories of the watched directory.
  for (const record of records) {
    markDirty(record);
  }
}

const observer = new FileSystemObserver(callback);
const options = { recursive: true };
await observer.observe(directoryHandle, options);
```

In this example, the `markDirty()` method can utilize numerous pieces of information from the `FileSystemChangeRecord` to more efficiently update the dirty indicator. See the [tentative IDL](#tentative-idl).

```javascript
// Implementation of the markDirty() function in the example above

async function markDirty(record) {
  // Decide how to mark the file dirty according to the
  // `FileSystemChangeType` included in each file system change record.
  switch (record.type) {
    case 'appeared':
      // `record.root` is the handle passed to `observe()`. Note that
      // the File System specification does not expose the concept of an
      // absolute path, so understanding a file system change is
      // inherently relative to some directory.
      markAppeared(record.root, record.relativePathComponents);
      break;
    case 'disappeared':
      // The relative path of the changed handle may be more useful than
      // the handle itself, since the file no longer exists.
      markDisappeared(record.root, record.relativePathComponents);
      break;
    case 'modified':
      // A handle to the changed path may be more useful than its
      // relative path if reading from the file is necessary to
      // understand the change.
      //
      // Note that records with the 'modified' change type may be noisy
      // (e.g. overwriting file contents with the same data) so it's
      // necessary to check whether the file actually changed.
      if (await checkIfChanged(record.changedHandle)) {
        markModified(record.root, record.relativePathComponents);
      }
      break;
    case 'moved':
      // `record.relativePathMovedFrom` is used exclusively for 'moved'
      // records, to indicate the previous path of the moved file.
      markMoved(record.root, record.relativePathMovedFrom,
                record.relativePathComponents);
      break;
    case 'unknown':
      // Unknown change event(s) may have been missed.
      if (await checkIfChanged(record.changedHandle)) {
        markChanged(record.root, record.relativePathComponents);
      }
      break;
    case 'errored':
      // Watching paths on the local file system may fail unexpectedly.
      // After receiving a record with an 'errored' change type, we will
      // not receive any more change records from this observer.
      // Unobserve this handle. You may then consider re-observing the
      // handle, though that may fail if the issue was not transient.
      observer.unobserve(record.root);
      // ...
      break;
  }
  // ...
}
```

#### Gotchas When Observing a Directory on the Local File System

Given the platform-specific differences, change records for directory observations of the local file system may or may not include information about which file within the directory has changed, or the type of change. See [Cross Platform Compatibility](#cross-platform-compatibility).

For example, in the [Observing a Directory Non-Recursively](#observing-a-directory-non-recursively) example above, the `handleChanges()` function may need to account for these platform-specific differences if `directoryHandle` corresponds to a directory on the local file system.

At best, the website will receive a detailed change record containing the type of change and a handle to the affected path. At worst, the website receives a more generic change record that still requires the website to enumerate the directory to figure out which child changed. Note that this is still an improvement over polling, since the directory enumeration can be kicked off on-demand from the `FileSystemObserverCallback`, rather than needing to poll for changes.

```javascript
// Implementation of the handleChanges() function in the example above

async function handleChanges(records) {
  // The `root` of the change record always corresponds to the directory
  // handle passed to the `observe()` method.
  assert(await fileHandle.isSameEntry(record[0].root));

  let sawFileCreatedRecord = false;
  for (const record of records) {
    // The `changedHandle` of the change record corresponds to the
    // file path on which the change has occurred. Alternatively, the
    // file path itself - relative to `root` - is accessible via the
    // `relativePathComponents` attribute.
    const changedHandle = record.changedHandle;

    // Take advantage of file-level notifications, if available.
    if (changedHandle.kind === 'file' && record.type === 'appeared') {
      sawFileCreatedRecord = true;
      readNewFile(changedHandle);
    }
  }

  // Otherwise fall back to enumerating the observed directory.
  // Only necessary for directories on the local file system.
  if (!sawFileCreatedRecord) {
    enumerateThroughDirectoryToFindAddedFile(records[0].root);
  }
  // ...
}
```

## Design Discussion

### Guaranteeing that Changes are Not Missed

In general, once the promise from `observer.observe(handle)` is resolved, `observer` will report all changes to 'handle' for as long as the observer is connected. However, it is not possible to _guarantee_ that all file system changes will be observed. Changes may be missed for the following reasons:

*   Changes made external to a centralized browser process may race with `FileSystemObserver` setup or disconnect. This applies to both renderer processes making changes to a Bucket File System and other processes on the system making changes to the local file system. See [Signaling Changes Made via a `FileSystemSyncAccessHandle`](#signaling-changes-made-via-a-`filesystemsyncaccesshandle`) for an example
*   Changes to the local file system may not always trigger a consumable (to the user agent) notification. See [When to Signal Local File System Writes](#when-to-signal-local-file-system-writes) for an example
*   Observing the local file system may fail for unexpected reasons

### Avoiding Exposing Implementation Details of the File System Specification

A `FileSystemObserver` should not reveal details of the user agent's implementation of the File System specification. For example,

*   Change records should never be triggered for writes to a swap file created by `FileSystemFileHandle.createWritable()`
*   For a `FileSystemHandle.move()` within the scope of a directory observation, the operation should trigger a single `“moved”` change record, regardless of whether the operation was atomic under the hood

### Handling Changes Made Outside the Lifetime of a `FileSystemObserver`

A `FileSystemObserver` should only report changes which occur while the observer is connected and the website has an open tab. [Historical modifications to the file](https://developer.apple.com/documentation/coreservices/1443980-fseventstreamcreate#parameters:~:text=watched%20for%20modifications.-,sinceWhen,-The%20service%20will) or modifications which occur while the tab is closed or in an otherwise non-”[fully active](https://html.spec.whatwg.org/multipage/document-sequences.html#fully-active)” state should not be reported.

Likewise, changes which occur before an observer is created should not be reported, though this behavior is not strictly guaranteed since file system changes may race with `FileSystemObserver` setup.

A `FileSystemObserver` is not [serializable](https://html.spec.whatwg.org/multipage/structured-data.html#serializable) and therefore cannot be persisted across browsing sessions. Websites which wish to watch the same files on each session may store serializable `FileSystemHandle` and `FileSystemObserverObserveOptions` objects in IndexedDB, then create a `FileSystemObserver` and configure it from these objects on page reload.

### Interactions with Back/forward Cache

If changes occurred while the page was not fully active, and the page becomes active again (i.e. back/forward cache), then user agents may use the `"unknown"` `FileSystemChangeType` to indicate that _changes_ have occurred. Specific types and ordering of changes should not be exposed but indicating that some changes have occurred could be useful to the website to perform any special handling.

### Signaling Changes Made via a `FileSystemSyncAccessHandle`

It is assumed that a user agent’s implementation of the `FileSystemObserver` interface will involve coordinating with a centralized browser process. However, unlike most web storage APIs, reading and writing files with a `FileSystemSyncAccessHandle` is commonly implemented largely without coordinating with a centralized browser process. This is critical to the exceptional performance characteristics of this interface. `write()` or `truncate()` operations on a `FileSystemSyncAccessHandle` should trigger a file system change record, but requiring round-trip IPC to complete before synchronously returning would be detrimental to performance.

This has some side effects when it comes to [guaranteeing that changes are not missed](#guaranteeing-that-changes-are-not-missed) - specifically, that signaling to the centralized browser process that a write occurred could race with a `FileSystemObserver` disconnecting, resulting in a file system change being missed. In the example below, since `FileSystemSyncAccessHandle.write()` does not wait for an acknowledgement from the centralized browser process before synchronously returning, it is not possible to synchronize the write and disconnection of the observer using locks.

```javascript
// Writes by a FileSystemSyncAccessHandle just before an observer is
// disconnected may not trigger corresponding change records

// main.js - Start observing a file
const observer = new FileSystemObserver(callback);
await observer.observe(fileHandle);

// worker.js - Create a writable handle to the file
const syncAccessHandle = await fileHandle.createSyncAccessHandle();

// If these statements execute at approximately the same time, will a
// file system change be recorded?

// worker.js
syncAccessHandle.write(buffer);
// main.js
observer.disconnect();
```

Note that [if the interface had a `takeRecords()` method](#add-a-takerecords-method), `FileSystemSyncAccessHandle.close()`could be used to synchronize disconnection of the observer. This should be considered as a future addition.

### Watching the Local File System

#### Cross-Platform Compatibility

Each operating system has its own mechanisms for observing file system changes. This proposal aims to offer a mostly-platform-neutral set of information about a change to the local file system based on the roughly-lowest-common-denominator set of information available from common modern operating systems.

However, given the cross-platform differences, this proposal does not attempt to specify how exactly a change notification from the operating system maps to a file system change record. Consider the following scenario:

```javascript
const callback = (records, observer) => {
  // What change record will be triggered when the file is created?
  // -> 1: { type: "appeared", relativePathComponents: ["file.txt"], ... }
  //    2: { type: "appeared", relativePathComponents: [], ... }
  //    3: { type: "modified", relativePathComponents: [], ... }
}

const observer = new FileSystemObserver(callback);
await observer.observe(directoryHandle, { recursive: true });
await directoryHandle.getFileHandle('file.txt', { create: true });
```

User agents should attempt to include the most precise information as it can reasonably obtain in the file system change record. In this example, the change record is most useful if it details that a specific file has been added (i.e. option 1) as opposed to mentioning just that the parent directory’s contents were modified - which would require the website to iterate through the directory to figure out which file has changed, and how.

All changes to a Bucket File System should deterministically map to a precise file system change record. In this example, the `getFileHandle()` call should result in a change record with a `”appeared”` change type and describe the change as occurring on the created file.

However, this level of detail is not realistic on all platforms for local file system changes. For example, Linux has no native support for recursive watches. As such, the details of a file system change record for a given change to the local file system should be regarded as best-effort. In the example below, the user agent may report either a `”appeared”` change type describing the created file, a `”appeared”` change type describing a creation within the observed directory, or a `”modified”` change type describing that the directory contents were modified.

```javascript
const callback = (records, observer) => {
  // What change record will be triggered when the file is created?
  // ?? 1: { type: "appeared", relativePathComponents: ["file.txt"], ... }
  // ?? 2: { type: "appeared", relativePathComponents: [], ... }
  // ?? 3: { type: "modified", relativePathComponents: [], ... }
}

const observer = new FileSystemObserver(callback);
await observer.observe(directoryHandle, { recursive: true });
// Now, create the file from outside the web
// (e.g. open a terminal locally, navigate to the directory
// corresponding to `directoryHandle`, then `touch file.txt`)
```

#### When to Signal Local File System Writes

Writing to a file on the local file system generally looks like the following:

1. Open a file descriptor for writing (i.e. [`open()`](https://man7.org/linux/man-pages/man2/open.2.html) with write flags)
2. Issue (possibly numerous) writes to the file descriptor (i.e. [`write()`](https://man7.org/linux/man-pages/man2/write.2.html))
3. Close the file descriptor (i.e.[` close()`](https://man7.org/linux/man-pages/man2/close.2.html))

Given the differences between the mechanisms for observing file system changes on each operating system, this proposal does not specify for which steps above change records should be relayed to JavaScript. Note that this _is_ specified when observing changes to the Bucket File System. See [Signaling Changes Made via a `FileSystemSyncAccessHandle`](#signaling-changes-made-via-a-`filesystemsyncaccesshandle`).

Triggering a change record for each `write()` call is likely to be quite noisy, which could negatively affect performance.

Meanwhile, triggering change record only on `close()` may both provide false positives (if the file descriptor is closed without writing anything) and false negatives (if the file descriptor is not closed while the `FileSystemObserver` is active).

As such, websites should expect that file system change records with a `"modified"` type corresponding to files on the local file system may be noisy.

#### Signaling Changes to File and Directory Metadata

On some platforms, it may not be possible to distinguish modifications to file _contents_ from modifications to file _attributes_. For example, on Windows the [`FILE_NOTIFY_INFORMATION`](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-file_notify_information) struct, which describes the changes found by the [ReadDirectoryChangesW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw) function, lumps both modifications to file contents and attributes into the [`FILE_ACTION_MODIFIED`](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-file_notify_information#members) `Action` type.

As such, the `“modified”` file system change type is intentionally vague. As noted [above](#when-to-signal-local-file-system-writes), websites should already expect that file system change records with a `"modified"` type corresponding to files on the local file system may be noisy. This may include changes to file metadata which are not observable from the web.

Currently, the only metadata available via the File System Access API is the metadata provided by the [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) interface: the MIME type, size, and last-modified timestamp. This may change in the future, however. See https://github.com/whatwg/fs/issues/12.

#### Permission Considerations

Using a `FileSystemObserver` should not give a website access to any files which it otherwise wouldn’t be able to access - nor should it relay information about a file which would otherwise be unknowable (e.g. by polling).

For example, consider a website which is recursively observing the directory `foo/` on the local file system. If `foo/file.txt` is moved to `bar/file.txt`, the website can no longer access the file. Accordingly, the website should receive a change record suggesting that `foo/file.txt`has been removed, rather than describing the inaccessible location it has been moved to.

Attempting to observe a file or directory without [`“read”`](https://wicg.github.io/file-system-access/#dom-filesystempermissionmode-read) permission will fail. If read access to the watched file or directory is lost, a change record with an `“errored”` type may be triggered.

#### Resource Constraints

Watching a large number of paths can consume scarce resources (e.g. memory usage, file descriptors). This is particularly true on Linux, which consumes file descriptors and watch descriptors to watch local file paths and which has no native support for recursive watches.

Accordingly, user agents may add restrictions to how many files or directories a website can watch.

#### Performance Considerations

Applications which use the `FileSystemObserver` interface in place of polling the file system will almost certainly see a decrease in CPU usage as the result of no longer needing to burn CPU cycles polling. Whether this results in noticeable performance improvements likely depends on how this compares to the increased resource consumption (see above) seen on some platforms.

Meanwhile, dispatching a potentially large number of events to websites that might not even be in the foreground could have significant performance impacts. Accordingly, user agents may choose to coalesce or rate-limit events. This API notably does _not_ require the user agent to guarantee a maximum latency for which events from the file system will be relayed to JavaScript.

#### Fingerprinting Risk

Multiple websites may be observing overlapping sets of files on the local file system. If change records for these files are dispatched at exactly the same time, this could be used to fingerprint a user even in incognito mode. A website with write access to local files could already determine that a user in incognito mode is the same as a user not in incognito, but by using a `FileSystemObserver` this becomes easier even with read-only access.

Accordingly, user agents may add noise to changes reported from the local file system to reduce the fingerprinting risk of overlapping file system observations.

#### Privacy Considerations

As noted in [Handling Changes Made Outside the Lifetime of a `FileSystemObserver`](#handling-changes-made-outside-the-lifetime-of-a-`filesystemobserver`), a `FileSystemObserver` should only report changes which occur while the website has a [fully active](https://html.spec.whatwg.org/multipage/document-sequences.html#fully-active) page.

## Alternatives Considered

### Require Developers to Manually Implement File Path Watching

The proposed API could be polyfilled from JavaScript, with varying degrees of complexity depending on whether you care to observe changes from outside your origin.

For many websites, this API will “just” be an ergonomic improvement. For websites regularly polling the file system - particularly recursively watching changes to a directory, which may currently be prohibitively expensive - this API is expected to result in significant performance and behavioral improvements.

### Alternatives to the Observer Pattern

#### Use an EventTarget-Style Interface

Web Platform Design Principles [broadly recommend creating APIs that use Events rather than an Observer pattern](https://w3ctag.github.io/design-principles/#events-vs-observers). In this case, an Observer pattern is more appropriate since:

*   The callback may be [triggered recursively](https://w3ctag.github.io/design-principles/#guard-against-recursion) if a file is modified in response to a file system change
*   An Observer pattern allows the user agent to batch changes if necessary. For example, during a "git pull" operation that causes a flood of file system changes, these changes could be batched rather than firing the callback dozens of times

#### Use an Async Iterable Interface

[Deno.watchFS](https://deno.land/api@v1.27.0?s=Deno.watchFs) uses an async iterable to relay file system changes.

```javascript
for await (const event of watcher) {
  // Do something with `event`
}
```

Async iterables are generally used for iterating over a set of objects, such as [the contents of a directory](https://fs.spec.whatwg.org/#filesystemdirectoryhandle). This does not feel like the right paradigm for this use case.

### Allow Only One FileSystemHandle to be Observed per FileSystemObserver

This proposal is modeled off of other “observer” interfaces on the web (e.g. [`MutationObserver`](https://dom.spec.whatwg.org/#interface-mutationobserver), [`IntersectionObserver`](https://www.w3.org/TR/intersection-observer/#intersectionobserver), [`PressureObserver`](https://www.w3.org/TR/compute-pressure/#the-pressureobserver-object)...) which all support observing multiple things per observer. One could ask if following that pattern is worth following here.

For now, there doesn’t seem to be a strong argument for limiting a `FileSystemObserver` to observe only one  `FileSystemHandle`. Barring such an argument, it seems reasonable to match the behavior of other observer interfaces and allow multiple observations per observer. Observing the same handle multiple times would overwrite any existing observation to the handle - [matching the behavior of `MutationObserver`](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/observe#reusing_mutationobservers).

A potential use case in support of multiple observations per observer is to get all pending changes at once - say, on tab closure. If only one `FileSystemHandle` could be observed per `FileSystemObserver`, this would require iterating through all observers to collect these changes. However, this would also require [a `takeRecords()` method](#add-a-takerecords-method), which isn't (yet) proposed here.

### Make `FileSystemObserverCallback` Pass a [Record](https://webidl.spec.whatwg.org/#idl-record) Keyed by the Observed Handle

In some cases, this may result in more performant and ergonomic code, since determining whether a specific file or directory was modified becomes a map lookup rather than a full list traversal.

For many cases, though, this would result in more boilerplate code. Further, it may be confusing whether the key refers to the handle which changed or the handle that was passed to `observe()`, which may be different if watching a directory recursively.

Use cases which perform different actions based on the handle that was passed to `observe()`may create many observers, each with its own callback, rather than calling `observe()` many times on the same observer.

### Signal Changes Made via a `FileSystemSyncAccessHandle` Only on Close

The [Signaling Changes Made via a `FileSystemSyncAccessHandle`](#signaling-changes-made-via-a-`filesystemsyncaccesshandle`) section above proposes signaling file system change records for each modifying operation. Alternatively, a single change record could be signaled when a `FileSystemSyncAccessHandle` which wrote to or truncated a file is closed. Note that this behavior may exist on some platforms when observing changes to the local file system. See details [above](#when-to-signal-local-file-system-writes).

In this approach, a `FileSystemSyncAccessHandle` which does not write to or truncate a file would not trigger any change record on close.

```javascript
// An alternative strategy to signaling changes made by a sync
// access handle: only trigger a file system change record on close()

const readHandle = await fileHandle.createSyncAccessHandle();
readHandle.read(buffer);  // Does not modify the file
readHandle.close();  // Do not trigger a change record

const writeHandle = await fileHandle.createSyncAccessHandle();
writeHandle.write(buffer);  // (likely) modifies the file
writeHandle.close();  // Trigger a change record
```

This strategy leads to some unintuitive behavior. For example, consider this scenario:

```javascript
// Unintutive behavior if sync access handles only triggered
// file system change records on close()

// Create and write to a file using a FileSystemSyncAccessHandle
const syncAccessHandle = await fileHandle.createSyncAccessHandle();
syncAccessHandle.write(buffer);

// Start observing the file
const observer = new FileSystemObserver(callback);
await observer.observe(fileHandle);

// Closing the FileSystemSyncAccessHandle triggers a "modified"
// change record, even though the write occurred before observation
// started.
syncAccessHandle.close();
```

Meanwhile, the reverse behavior is also true:

```javascript
// More unintutive behavior if sync access handles only triggered
// file system change records on close()

// Start observing a file
const observer = new FileSystemObserver(callback);
await observer.observe(fileHandle);

// Create and write to the file using a FileSystemSyncAccessHandle
const syncAccessHandle = await fileHandle.createSyncAccessHandle();
syncAccessHandle.write(buffer);

observer.disconnect();

// No change record will be triggered, even though the write occurred
// before the observer disconnected.
syncAccessHandle.close();
```

## Future Improvements

### Support Filtering Change Records

As currently proposed, a `FileSystemObserver` will notify of all file system changes which fall within the scope of the observation. However, it may be useful to filter change records before they’re forwarded to JavaScript, which would reduce noise and may provide some performance benefit.

This proposal leaves the door open to add some or all of these filters later on.

#### Change Source

In the same way that `BroadcastChannel` does not send a message to the object that sent the message, the context which is modifying the file system often would prefer not to hear about changes that it itself is making. Likewise, there are some use cases where this is explicitly useful, such as journaling all changes to a given file. To support this use case, the website could optionally specify a filter in the options dictionary to subscribe only to changes from a given set of contexts:

```javascript
// Future improvement: filtering by the source of a file system change

enum FileSystemChangeSource {
  "self",        // The change was made by the current agent
  "storagekey",  // The change was made by this storage key
  "other"        // The change was made by some other context
};

// Observe only changes made from outside your storage key
const options = { filters: [{ sources: ['other'] }]};
// Or, listen only to changes not made by the observing context
// (like BroadcastChannel)
const options = { exclusionFilters: [{ sources: ['self'] }]};

await observer.observe(fileHandle, options);
```

Using the options currently available to a website for tracking changes as a guide for granularity, a `FileSystemChangeRecord` could include a `source` without exposing any information to the web that isn’t already exposed.

*   Tracking changes by `“self”` can be achieved by logging file system operations as they’re performed by the current context
*   Tracking changes by `“storagekey”` can be achieved via `BroadcastChannel`, as described above. This could also be extended to include _which_ other tab modified a file
*   Tracking changes by `“other”` can be achieved by polling the file system, as described above

#### Changed Path

This option only makes sense for recursive observations, though may be a cause for confusion given [cross-platform differences](#cross-platform-compatibility).

```javascript
// Future improvement: filtering the path of a file system change

// Ignore changes to specific paths
const options = {
    recursive: true,
    exclusionFilters: [{ paths: [['.git'], ['node_modules']] }]
};
await observer.observe(repoRootDirHandle, options);
```

#### Change Type

It’s unclear whether this would be useful - especially [cross-platform differences](#cross-platform-compatibility) - but I note it here for completeness.

### Signaling Changes to File Lock State

Consider a website running a [SQLite-over-Wasm](https://sqlite.org/wasm/doc/trunk/index.md) database backed by a Bucket File System in a dedicated worker, which should be notified of database changes from the main thread as soon as the database file is unlocked.

Having explicit `“locked”` and `”unlocked”` change types could allow websites to listen explicitly for changes to file lock state and attempt to acquire a lock once the file becomes unlocked.

```javascript
// Future improvement: "locked" and "unlocked" file system change types

// index.js
const callback = (records, observer) => {
  if (records.some((record) => record.type === 'unlocked'))
    // Attempt to read back recent changes, or acquire a new lock
}

const observer = new FileSystemObserver(callback);
await observer.observe(dbFileHandle);
askWorkerToWriteSomeData(dbFileHandle, someData);

// worker.js
const syncAccessHandle = await dbFileHandle.createSyncAccessHandle();
syncAccessHandle.write('the associated file handle is locked');
syncAccessHandle.close();  // Releases the lock
```

For now, it’s unclear whether this would be useful. A `“modified”` event may be a good enough proxy for an `“unlocked”` event in many cases (though notably not when using a `FileSystemSyncAccessHandle`). We can always add these change types later on.

### Add a `takeRecords()` Method

This method could be useful when disconnecting the observer to immediately fetch all pending file system change records. See an example use case [above](#allow-only-one-filesystemhandle-to-be-observed-per-filesystemobserver). This seems to be of limited usefulness, at least for now, given that we [cannot guarantee that changes are not missed](#guaranteeing-that-changes-are-not-missed) and that [changes can be made outside the lifetime of the observer](#handling-changes-made-outside-the-lifetime-of-a-`filesystemobserver`).


### Add a `listObservations()` Method

This method could be useful to see which files and directories are being watched. For now it’s unclear whether this is needed, or what this should return for errored watches.

## Stakeholder Feedback / Opposition

*   Developers: Strongly positive
    *   https://github.com/WICG/file-system-access/issues/72
    *   https://github.com/whatwg/fs/issues/123
    *   https://github.com/w3c/IndexedDB/issues/51
*   Gecko: Positive
    *   https://github.com/mozilla/standards-positions/issues/942#issuecomment-2113526096
*   WebKit: No signals

## Appendix

### Tentative IDL

```javascript
interface FileSystemObserver {
  constructor(FileSystemObserverCallback callback);
  Promise<void> observe(FileSystemHandle handle,
      optional FileSystemObserverObserveOptions options = {});
  void unobserve(FileSystemHandle handle);
  void disconnect();
};

callback FileSystemObserverCallback = void (
    sequence<FileSystemChangeRecord> records,
    FileSystemObserver observer
);

enum FileSystemChangeType {
  "appeared",
  "disappeared",
  "modified",
  "moved",
  "unknown",      // Change types are not known
  "errored"       // This observation is no longer valid
};

dictionary FileSystemObserverObserveOptions {
  bool recursive = false;
};

interface FileSystemChangeRecord {
  // The handle that was passed to FileSystemObserver.observe
  readonly attribute FileSystemHandle root;
  // The handle affected by the file system change
  readonly attribute FileSystemHandle changedHandle;
  // The path of `changedHandle` relative to `root`
  readonly attribute FrozenArray<USVString> relativePathComponents;
  // The type of change
  readonly attribute FileSystemChangeType type;
  // Former location of a moved handle. Used only when type === "moved"
  readonly attribute FrozenArray<USVString>? relativePathMovedFrom;
};
```
