import AbortController from 'node-abort-controller'
import Blob from 'fetch-blob'
import DOMException from 'domexception'
import test from 'tape'

import getOriginPrivateDirectory from '../src/getOriginPrivateDirectory.js'
import steps from './test.js'

class File extends Blob {
	constructor(blobParts, fileName, options = {}) {
		const { lastModified = Date.now(), ...blobPropertyBag } = options
		super(blobParts, blobPropertyBag)
		this.name = String(fileName).replace(/\//g, '\u003A')
		this.lastModified = +lastModified
		this.lastModifiedDate = new Date(lastModified)
	}

  get [Symbol.toStringTag]() {
		return 'File'
	}
}

globalThis.AbortController = AbortController
globalThis.Blob = Blob
globalThis.File = File
globalThis.DOMException = DOMException

async function start () {
  const root = await getOriginPrivateDirectory(import('../src/adapters/node.js'), './testfolder')
  const memory = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

  for (let step of steps) {
    if (step.desc.includes('atomic')) continue
    test('server: ' + step.desc, async function (t) {
      await cleanupSandboxedFileSystem(root)
      await step.fn(root)
      t.end()
    })
  }

  for (let step of steps) {
    test('memory: ' + step.desc, async function (t) {
      await cleanupSandboxedFileSystem(memory)
      await step.fn(memory)
      t.end()
    })
  }
}

start()

async function cleanupSandboxedFileSystem (root) {
  for await (let entry of root.entries()) {
    await root.removeEntry(entry.name, { recursive: entry.kind === 'directory' })
  }
}
