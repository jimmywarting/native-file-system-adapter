# The FileSystemHandle.remove() method

# Authors:

* Austin Sullivan (asully@chromium.org)

## Participate

* [Issue tracker](https://github.com/whatwg/fs/issues)

## Introduction

This explainer proposes a "remove self" method for a `FileSystemHandle`.

Currently, it is not possible to remove a file or directory given its handle.
You must obtain the handle of the parent directory, which there is no
straightforward way to do and may not be possible in some cases, and call
`FileSystemDirectoryHandle.removeEntry()`.

## Goals

* Allow removal of any entry a site has write access to
* Avoid surprises by matching the behavior and API shape of
  `FileSystemDirectoryHandle.removeEntry()`

## Use Cases

### Removing a handle selected via showSaveFilePicker()

It's quite common for a site to obtain a file handle from
`showSaveFilePicker()`, but then decide not to save after all, and want
to delete the file.

Currently, this requires obtaining write access to the parent directory and
calling `removeEntry()` on the file. However, files selected from
`showSaveFilePicker()` are often in the Downloads/ or Documents/ folders, which
we do not allow the site to acquire directory handles to.

```javascript
// Acquire a file handle to save some data
const handle = await window.showSaveFilePicker();
// Write some data to the file
const writable = await handle.createWritable();
await writable.write(contents);

// ... some time later ...

// Nevermind - remove the file
await handle.remove();
```

### Allow applications to clear data not managed by the browser

One use case of the File System Access API is for a site to show a directory
picker to a location where the user would like its application data stored.
Unlike other storage mechanisms provided by the browser, files on the user's
machine are not tracked by the browser's quota system (meaning it can't be
evicted), nor will it be cleared when the user clears site data.

The `id` and `startIn` fields can be specified to suggest the directory in
which the file picker opens. See
[details in the spec](https://wicg.github.io/file-system-access/#api-filepickeroptions-starting-directory).

There some significant downsides to this approach, most notably the inability
to use the `FileSystemSyncAccessHandle` interface for non-OPFS files.
Additionally, if a well-behaving application wants to clear all its associated
data, it currently cannot remove the root of the directory.

```javascript
// Application asks "Where shall I save my data?"
// User selects a new directory: /user/blah/AwesomeAppData/
const dirHandle = await window.showDirectoryPicker();

// ... some time later ...

// User asks "Please clear my data"

// Before: /user/blah/AwesomeAppData/ can be emptied, but the application
//         _cannot_ remove the directory itself
await dirHandle.removeEntry({ recursive: true });
// After: /user/blah/AwesomeAppData/ is removed
await dirHandle.remove({ recursive: true });
```

### Improve ergonomics of the API

Currently, removing an entry requires not only write access to the parent
directory, but the parent directory itself. This can be a hassle, especially
because the API [does not have an easy way to get the parent](https://github.com/whatwg/fs/issues/38)
of a handle.

```javascript
// Given `handle` that I want to remove…

// Before: Somehow acquire the parent directory. Hopefully you've kept around
// its root. You'll need to:
//   - resolve the handle to the root to get the intermediate path components
const pathComponents = await root.resolve(handle);
//   - create the directory handle for each intermediate directory
let parent = root;
for (const component of pathComponents)
  parent = await parent.GetDirectoryHandle(component);
//   - finally, remove based on the handle's name
await parent.removeEntry(handle.name);

// After: just remove the handle
await handle.remove();
```

## Security Considerations

* Removing a file or directory requires write access to the associated entry.
  For example, files selected via `showOpenFilePicker()` are read-only by
  default and will not be removable unless the user explicitly grants write
  access to the entry
* Recursive directory removal is currently possible via the `removeEntry()`
  method of the `FileSystemDirectoryHandle`
* This method allows for removal of the root entry selected from the file
  picker, but since applications are
  [not able to obtain a handle to sensitive directories](https://github.com/WICG/file-system-access/blob/main/security-privacy-questionnaire.md#26-what-information-from-the-underlying-platform-eg-configuration-data-is-exposed-by-this-specification-to-an-origin)
  in the first place, this root entry is guaranteed not to be considered
  sensitive

## Stakeholder Feedback / Opposition

* Developers: [Positive](https://github.com/WICG/file-system-access/issues/214)
* Gecko: [Positive](https://github.com/WICG/file-system-access/pull/283#issuecomment-1036085470)
* WebKit: No signals
