/* global File */

/**
 * A base class for in-memory Blob-based adapter sinks.
 * Handles the Blob slice-and-reassemble write and truncate logic that is
 * common to the memory, IndexedDB, and Cache API adapters.
 * Adapters that store files as Blobs/Files should extend this class.
 *
 * The outer layer (FileSystemWritableFileStream) is responsible for:
 *  - Parsing WriteParams ({ type: 'write'|'seek'|'truncate', … })
 *  - Tracking the current write position
 *  - Seeking (just a position update, no I/O needed)
 *  - Padding/extending the file when a write position exceeds the current size
 *    (via an explicit truncate() call before write())
 *
 * This class therefore only needs to implement the minimal raw-I/O interface:
 *   write(blob, position)  – splice blob into the in-memory File at position
 *   truncate(size)         – shrink or grow the in-memory File
 */
export class BlobSink {
  /** @param {File} file */
  constructor (file) {
    this.file = file
    /** Exposed so FileSystemWritableFileStream can read the initial file size. */
    this.size = file.size
  }

  /**
   * Write a Blob at the given byte offset.
   * The caller guarantees that position <= this.size (padding was already
   * applied via truncate() if necessary).
   *
   * @param {Blob} blob
   * @param {number} position
   */
  write (blob, position) {
    const head = this.file.slice(0, position)
    const tail = this.file.slice(position + blob.size)
    this.file = new File([head, blob, tail], this.file.name)
    this.size = this.file.size
  }

  /**
   * Truncate (or zero-extend) the in-memory File to exactly `size` bytes.
   *
   * @param {number} size
   */
  truncate (size) {
    const file = this.file
    this.file = size < this.size
      ? new File([file.slice(0, size)], file.name, file)
      : new File([file, new Uint8Array(size - this.size)], file.name)
    this.size = this.file.size
  }
}
