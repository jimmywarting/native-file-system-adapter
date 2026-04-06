import { errors } from '../util.js'

const { GONE, MISMATCH, MOD_ERR, DISALLOWED } = errors

/**
 * An adapter Sink must implement this minimal interface.
 * All WriteParams parsing ({ type: 'write'|'seek'|'truncate', … }),
 * write-position tracking, and seek/truncate validation are handled by
 * the outer FileSystemWritableFileStream – adapters never see raw WriteParams.
 *
 * Required properties / methods:
 *   size                      – initial file size (number), read once at stream creation
 *   write(blob, position)     – write a Blob at the given byte offset
 *   truncate(size)            – shrink or zero-extend the file to `size` bytes
 *   close()                   – commit changes
 *   abort()                   – discard changes
 */
export class Sink {
  constructor () {
    /** Expose the initial file size so FileSystemWritableFileStream can read it. */
    this.size = 0
  }

  /**
   * Write a Blob at the given byte offset.
   * The outer layer guarantees that `position <= current file size`
   * (padding is applied via truncate() before write() if needed).
   *
   * @param {Blob} blob
   * @param {number} position
   * @returns {void | Promise<void>}
   */
  write (blob, position) {
  }

  /**
   * Truncate (or zero-extend) the file to exactly `size` bytes.
   *
   * @param {number} size
   * @returns {void | Promise<void>}
   */
  truncate (size) {
  }

  /**
   * Commit any pending writes.
   * @returns {void | Promise<void>}
   */
  close () {
  }

  /**
   * Discard any pending writes.
   * @returns {void | Promise<void>}
   */
  abort () {
  }
}

export class FileHandle {
  constructor () {
    this._path = ''
  }

  /**
   * @public - publicly available to the wrapper
   * @returns {Promise<File>}
   */
  async getFile () {
    return new File([], '')
  }

  /**
   * @public - Publicly available to the wrapper
   * @param {{ keepExistingData: boolean }} opts
   * @returns {Promise<Sink>}  A Sink with: size (number), write(blob, position), truncate(size), close(), abort()
   */
  async createWritable (opts) {
    return new Sink()
  }

  /**
   * @public - Publicly available to the wrapper
   * @param {FileHandle} other
   * @returns {Promise<boolean>}
   */
  async isSameEntry (other) {
    return other._path === this._path
  }
}

export class FolderHandle {
  constructor () {
    this._path = ''
  }

  /**
   * @public - Publicly available to the wrapper
   * @returns {AsyncGenerator<[string, FileHandle | FolderHandle]>}
   */
  async * entries () {
    yield
  }

  /**
   * @public - Publicly available to the wrapper
   * @param {FolderHandle} other
   * @returns {Promise<boolean>}
   */
  async isSameEntry (other) {
    return other._path === this._path
  }

  /**
   * @public - Publicly available to the wrapper
   * @param {string} name
   * @param {{ create: boolean; }} options
   * @return {Promise<FolderHandle>}
   */
  async getDirectoryHandle (name, options) {
    return new FolderHandle()
  }

  /**
   * @public - Publicly available to the wrapper
   * @param {string} name - The filename of the FileHandle to get
   * @param {{ create: boolean; }} options
   * @return {Promise<FileHandle>}
   */
  async getFileHandle (name, options) {
    return new FileHandle()
  }

  /**
   * Removes the entry named `name` in the directory represented
   * by directoryHandle. If that entry is a directory, its
   * contents will also be deleted recursively.
   *
   * Attempting to delete a file or directory that does not
   * exist is considered success.
   *
   * @public - Publicly available to the wrapper
   * @param {string} name - The name of the file or folder to remove in this directory
   * @param {{ recursive: boolean; }} options
   * @return {Promise<void>}
   */
  async removeEntry (name, options) {
  }
}

const fs = new FolderHandle('')

export default () => fs
