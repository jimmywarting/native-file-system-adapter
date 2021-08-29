import * as fs from '../lib/es2018.js'
import steps from './test.js'
import {
  cleanupSandboxedFileSystem
} from '../test/util.js'

const { getOriginPrivateDirectory } = fs

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
  const root = await getOriginPrivateDirectory(import('../lib/adapters/deno.js'), './testfolder')
  const memory = await getOriginPrivateDirectory(import('../lib/adapters/memory.js'))

  let hasFailures = false

  for (let step of steps) {
    if (step.desc.includes('atomic')) continue
    if (!await test('deno', step, root)) {
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
    Deno.exit(1)
  }
}

await start()
