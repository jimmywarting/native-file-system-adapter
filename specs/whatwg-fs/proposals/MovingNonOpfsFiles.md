# Moving Non-OPFS Files

## Authors

* Austin Sullivan (asully@chromium.org)

## Participate

* [Issue tracker](https://github.com/whatwg/fs/issues)

## Introduction

When launching [SyncAccessHandles](https://github.com/whatwg/fs/pull/21), we launched `FileSystemFileHandle.move()` for files within the [Origin Private File System](https://web.dev/file-system-access/#accessing-files-optimized-for-performance-from-the-origin-private-file-system) (OPFS). Moving of files outside of the OPFS and moving directories at all are not yet supported.

This explainer proposes allowing the `FileSystemFileHandle.move()` method to move files that do not live in the Origin Private File System, i.e. user-visible files on the device.

## Goals

* Allow for all files to be efficiently renamed (rename is considered a subset of move)
* Allow for all files to be moved to a different directory
* Allow files to be moved within filesystems, while avoiding setting a regrettable precedent of supporting moves from anywhere to anywhere
* Improve the ergonomics of the API

## Non-goals

* Support moving files between the OPFS and the local file system
* Support moving files between the local machine and a remote (not locally mounted) file system

## Improve the ergonomics of the API

Currently, moving or renaming a file requires three steps:

1. Obtain
2. Copy
3. Delete

Each of these three steps in is brittle:

1. Obtaining write access to the target file requires either:
    1. Obtaining access the parent directory (which can be a hassle, because the API [does not have an easy way to get the parent](https://github.com/whatwg/fs/issues/38) of a handle and may not be possible if the parent directory is restricted, such as `Downloads/` or `Documents/`), then calling `getFileHandle(‘target.txt’, { create:true })` to create the target file, or
    2. Calling `showSaveFilePicker({ startIn: sourceHandle, suggestedName: ‘target.txt’ })` and hoping the user selects the correct file
2. Copying the file contents is painfully slow for large files, may fail if the disk runs out of space, and may result in a partially-written file
3. Take care not to remove the source before you’ve confirmed that the target file was written in its entirety. If step 2 fails, the disk may have done all this work only to have to remove the partially-written target file and report to the user that the rename failed. This is a poor user experience

The `move()` method drastically improves the ergonomics of the API.

Before:

```javascript
// Prompt the user to select a target file, suggested to be
// 'target.txt', with "readwrite" access
const targetHandle = await window.showSaveFilePicker({ startIn: sourceHandle, suggestedName: 'target.txt'});

// Copy the contents of the source file to the target file
const sourceFile = await sourceHandle.getFile();
const writable = await targetHandle.createWritable();
await sourceFile.stream().pipeTo(writable);

// Remove the source file if none of the steps above failed
await sourceHandle.remove();
```

After:

```javascript
// Rename the file (may require user activation)
await handle.move('target.txt');
```

## Use cases

### Rename a file

A user is editing a large video file on the local disk with a video editing application and wants to rename the file from `old.mp4` to `new.mp4`.

Currently, this requires all three steps above. For large files, step 2 is particularly troublesome.

The `move()` method turns this into an efficient one-liner. Note that user activation may be required if the site does not have write access to the target file.

### Move a file to a new directory within the same file system

A web photo editor wants to move a file from `Photos/IMG_20230123_123456789.jpg` to `Documents/MyVacation/beach.jpg`.

Once write permission to the destination directory is acquired, `move()` replaces steps 2 and 3 from above.

### Move a file from an external drive to the local file system

A web photo editor wants to move a file from `external_drive/IMG_20230123_123456789.jpg` to `Documents/MyVacation/beach.jpg`.

Once write permission to the destination directory is acquired, `move()` replaces steps 2 and 3 from above.

Under the hood, this is a create + copy + delete. But that’s for the underlying operating system to implement - not the browser. It’s possible this results in a partial write (e.g. if the drive is disconnected or runs out of space), but since the site has write access to the destination directory it may have a chance to remove the partially-written file.

## What about moving files from the OPFS to user visible directories, or vice-versa?

Previous proposals included support for best-effort moves of files and directories across file systems. We are not pursuing this at this time.

### What challenges exist with moving files out of the OPFS?

* Files in the OPFS [have few restrictions on the allowed characters in their names](https://github.com/web-platform-tests/wpt/blob/4981b40a9b00f87091c417e096e40c327b9407ed/fs/script-tests/FileSystemDirectoryHandle-getFileHandle.js#L18-L44), while [local files are limited by what’s allowed on the underlying operating system](https://fs.spec.whatwg.org/#valid-file-name).
* Files written within the OPFS are not subject to security checks, while [user agents are encouraged](https://wicg.github.io/file-system-access/#security-malware) to perform safe browsing checks and apply the Mark-of-the-Web to local files created or modified by this API. Note that this challenge is significantly more daunting for directory moves.

These challenges are all resolvable, but not without a compelling use case for OPFS &lt;-> local file moves.

### What about exporting files from the OPFS to the local file system?

A common use case cited in earlier proposals was to “export” a file from the OPFS to the local file system. In practice, we expect most sites just want to _copy_ the file to the local file system and retain a copy in the OPFS.

Besides, since files within the OPFS may or may not correspond to “actual” files on disk, this move operation is likely to be a create + copy + delete anyways and would likely come with marginal performance gains, if any.

For now, we don’t believe this is a use case which requires built-in API support. Developers can create + copy + delete (as they do today - see the code snippet above).

### What if I have a compelling use case?

If a compelling use case comes along, we can always reconsider this decision and add support later. It’s much easier to add functionality to the web platform than to remove it. To make your case, please file an issue on the spec at <https://github.com/WICG/file-system-access/issues>.

### What about moving files between OPFS instances?

The [Storage Buckets API](https://wicg.github.io/storage-buckets/explainer.html) will allow a site to have multiple Origin Private File System instances (whoops, [that name aged poorly](http://go/gh/whatwg/fs/issues/92)). Since that feature is still in incubation, we are not considering this at this time.

### What if I try it anyways?

The promise will be rejected with a `InvalidModificationError` `DOMException`.

## What about moving files from the local file system to a remote machine, or vice-versa?

The File System specification frequently mentions “the underlying file system.” If the file does not correspond to a file on the underlying file system, the user agent may reject the move operation with a `NotSupportedError` `DOMException`.

Note that remote file systems may be mounted as directories on the local file system. The user agent is encouraged to support this use case, since the underlying operating system should be able to handle the move. The recommended rule of thumb is: if you can `mv` it you can `move()` it.

## What About Directory Moves?

We would still like to support directory moves. Please read the [”What is a FileSystemHandle?”](https://github.com/whatwg/fs/issues/59) issue on GitHub for more context on why we’re punting on this for now.

## Security Considerations

### Overwriting Existing Files

A site may overwrite an existing file only if it already explicitly has write access to the file being overwritten. Otherwise, the move will be rejected with a permission error.

See [this doc](https://docs.google.com/document/d/1U6C6YvGtdwzw264xi7eXz26jha7vvT8d-WdwgnH7Ufw/edit?usp=sharing&resourcekey=0-OAo3LNSx9--4n8f_kNx6Vg) for more context.

### Security Checks

User agents are recommended to perform security checks on files moved within the local file system.

### Permission Checks

File moves will have the following requirements:

* For cross-directory moves:
  * Write permission to the file being moved **is required**
  * Write permission to the destination directory **is required**
  * Write permission to the source directory **is not required**
* For renames (moves within the parent directory):
  * Write permission to the file being moved **is required**
  * Write permission to the parent directory **is not required**
    * However, user activation is required if write permission is not granted to the destination file

Previously, we had discussed requiring write permission to both the source and destination directories. However, while this may seem the more conservative option, it incentivizes sites to ask for permission to more than they otherwise would and is not an option in many cases (especially on ChromeOS). See the [Alternatives Considered](https://docs.google.com/document/d/1yMWkT9FAF0ohBRv_dzAcOpoNlWJ0n9n48K6_UQD-HVs/edit#heading=h.ulr5fzcm9d8k) section for more context.

### File Locking

Moving a file will require obtaining an exclusive lock to both the source and destination files. For example, if a source or destination file has an open `FileSystemSyncAccessHandle` or `FileSystemWritableFileStream`, it cannot be moved.

For files outside of the OPFS, these are cross-site locks. For example, if site A is actively writing to file `Y`, site B’s` Y.move(Z)` request will be denied with a "file locked" error. While this is technically a cross-site interaction, we do not foresee any security concerns with this behavior because:

* A site will only encounter a file locked by another site if the user has explicitly granted access to the same file on multiple sites
* A site can tell that the file is locked, but nothing more (i.e. not by whom)

## Alternatives Considered

### Support moving files files from anywhere to anywhere

The web is an expansive platform that operates on all file systems. We do not want to set a precedent that the browser \_must\_ support moving \_any\_ file (or directory) from any one place to another.

#### Support moving files to/from the OPFS

See [What about moving files from the OPFS to user visible directories, or vice-versa?](#what-about-moving-files-from-the-opfs-to-user-visible-directories-or-vice-versa)

### Support only moving files which live on the same underlying file system

See the [Move a file from an external drive to the local file system](#move-a-file-from-an-external-drive-to-the-local-file-system) use case. While this may be a create + copy + delete under the hood, from the browser’s perspective it’s just an `mv`.

### Require write permission to the parent directory for renames

Requiring write access to the parent directory might feel like a conservative choice, but this:

* may not be possible if the file lives in a blocked directory, such as `Downloads/`. This is especially significant on ChromeOS, where most files end up in the `MyFiles` directory
* may incentivize sites to request access to directories rather than specific files (giving the site more access than they would otherwise ask for)
* seems like an awfully big gap in the API, since any file the site has access to without the parent cannot be renamed (which is the case for most files saved via the `showSaveFilePicker()` API)

Contrast that with the downsides of _not_ requiring write access to the parent directory:

* A site may discover the names of siblings by brute-forcing file renames (while holding user activation) and listening for promise rejections

However, the site has no way to access these siblings without showing a picker. This is a low-reward exercise. The privacy risk of incentivizing sites to request a directory picker seems much greater.

### Require write permission to the source directory

From the perspective of the source directory, a cross-directory move looks the same as `remove()` (i.e. the file disappears). `remove()` does not require write access to the parent, so this is not a concern.

### Always allow overwriting files

We cannot allow a site to overwrite files which it does not explicitly have write access to.

### Never allow overwriting files

Emulating POSIX (which allows overwriting files) within the OPFS is a compelling use case for this. See <https://github.com/whatwg/fs/pull/10#issuecomment-1322993643>.

### Do not support cross-site locks

This would allow multiple sites to take their own exclusive locks to a given file. While this would prevent sites from encountering “file locked by another site” behavior, it would also erode the guarantees of an “exclusive” lock.

### Only support renaming

This would not support cross-directory same-file-system moves, which makes the API significantly less useful to applications such as web-based IDEs.

## Stakeholder Feedback / Opposition

* Developers: Strongly positive
  * <https://github.com/WICG/file-system-access/issues/64>
* Gecko: No signals
* WebKit: No signals
