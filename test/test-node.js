import { existsSync, mkdirSync, rmdirSync } from 'node:fs'
import { getOriginPrivateDirectory } from '../src/es6.js'
import steps from './test.js'
import { cleanupSandboxedFileSystem } from '../test/util.js'

let hasFailures = false

async function test (fs, step, root) {
  try {
    await cleanupSandboxedFileSystem(root)
    await step.fn(root)
    console.log(`[OK]: ${fs} ${step.desc}`)
  } catch (err) {
    console.log(`[ERR]: ${fs} ${step.desc}\n\t-> ${err.message}`)
    hasFailures = true
  }
}

async function start () {
  const testFolderPath = './testfolder'
  if (!existsSync(testFolderPath)) {
    mkdirSync(testFolderPath)
  }
  const root = await getOriginPrivateDirectory(import('../src/adapters/node.js'), './testfolder')
  const memory = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

  for (const step of steps) {
    if (step.desc.includes('atomic')) continue
    await test('server', step, root).finally()
  }

  rmdirSync(testFolderPath)

  console.log('\n\n\n')

  for (const step of steps) {
    await test('memory', step, memory).finally()
  }

  if (hasFailures) {
    console.log('\n\nSome tests failed. See output above.')
    process.exit(1)
  }
}

start().catch(e => {
  console.error(e)
  process.exit(1)
})
