import * as fs from '../src/es6.js'
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
  } catch (err) {
    console.log(`[ERR]: ${fs} ${step.desc}`)
  }
}

async function start () {
  const root = await getOriginPrivateDirectory(import('../src/adapters/deno.js'), './testfolder')
  const memory = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

  for (let step of steps) {
    if (step.desc.includes('atomic')) continue
    await test('server', step, root).finally()
  }

  console.log('\n\n\n')
  setTimeout(()=>{}, 222222)

  // for (let step of steps) {
  //   await test('memory', step, memory).finally()
  // }
}

start()
