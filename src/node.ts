import File from 'fetch-blob/file.js'
import Blob from 'fetch-blob'
import { setBlobImpl, setFileImpl } from './adapters/memory.js'

// File and Blob interfaces are not 100% compliant but it's the best we can do
// We try to use global File/Blob if they exist, just in case we're importing in a universal app
setFileImpl(globalThis.File || File as any)
setBlobImpl(globalThis.Blob || Blob as any)

export * from './es2018.js'
