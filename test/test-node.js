import Blob from 'fetch-blob'
import { ReadableStream } from '../lib/web-streams-ponyfill.js'
import { getOriginPrivateDirectory } from '../lib/node.js'
import steps from './test.js'
import {
  cleanupSandboxedFileSystem
} from '../test/util.js'
import { existsSync, mkdirSync } from 'fs'

// Make sure Blob and ReadableStream are defined b/c they are used in the tests
globalThis.Blob = Blob
globalThis.ReadableStream = ReadableStream

async function test(fs, step, root) {
  try {
    await cleanupSandboxedFileSystem(root)
    await step.fn(root)
    console.log(`[OK]: ${fs} ${step.desc}`)
    return true
  } catch (err) {
    console.log(`[ERR]: ${fs} ${step.desc}\n\t-> ${err.message}`)
    return false
  }
}

async function start () {
  const testFolderPath = './testfolder'
  if (!existsSync(testFolderPath)) {
    mkdirSync(testFolderPath)
  }
  const root = await getOriginPrivateDirectory(import('../lib/adapters/node.js'), testFolderPath)
  const memory = await getOriginPrivateDirectory(import('../lib/adapters/memory.js'))

  let hasFailures = false

  for (let step of steps) {
    if (step.desc.includes('atomic')) continue
    if (!await test('node', step, root)) {
      hasFailures = true
    }
  }

  console.log('\n\n\n')

  for (let step of steps) {
    if (!await test('memory', step, memory)) {
      hasFailures = true
    }
  }

  if (hasFailures) {
    console.log(`\n\nSome tests failed. See output above.`)
    process.exit(1)
  }
}

start().catch(e => {
  console.error(e);
  process.exit(1)
})
