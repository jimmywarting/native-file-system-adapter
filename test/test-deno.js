import * as fs from '../src/es6.js'
import steps from './test.js'
import {
  cleanupSandboxedFileSystem
} from '../test/util.js'

const { getOriginPrivateDirectory } = fs

async function test (fs, step, root) {
  try {
    await cleanupSandboxedFileSystem(root)
    await step.fn(root)
    console.log(`[OK]: ${fs} ${step.desc}`)
    return true
  } catch (err) {
    console.log(`[ERR]: ${fs} ${step.desc}`)
    return false
  }
}

async function start () {
  const root = await getOriginPrivateDirectory(import('../src/adapters/deno.js'), './testfolder')
  const memory = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

  let hasFailures = false

  for (const step of steps) {
    if (step.desc.includes('atomic')) continue
    if (await test('server', step, root)) {
      hasFailures = true
    }
  }

  console.log('\n\n\n')

  for (const step of steps) {
    if (await test('memory', step, memory)) {
      hasFailures = true
    }
  }

  if (hasFailures) {
    console.log(`\n\nSome tests failed. See output above.`)
    Deno.exit(1)
  }
}

start()
