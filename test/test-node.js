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
  const root = await getOriginPrivateDirectory(import('../src/adapters/node.js'), './testfolder')
  const memory = await getOriginPrivateDirectory(import('../src/adapters/memory.js'))

  for (let step of steps) {
    if (step.desc.includes('atomic')) continue
    await test('server', step, root).finally()
  }

  console.log('\n\n\n')
  setTimeout(()=>{}, 222222)

  for (let step of steps) {
    await test('memory', step, memory).finally()
  }
}

start()

// globalThis.fs = fs

// async function init () {
//   const drivers = await Promise.allSettled([
//     getOriginPrivateDirectory(),
//     getOriginPrivateDirectory(import('../src/adapters/sandbox.js')),
//     getOriginPrivateDirectory(import('../src/adapters/memory.js')),
//     getOriginPrivateDirectory(import('../src/adapters/indexeddb.js')),
//     getOriginPrivateDirectory(import('../src/adapters/cache.js'))
//   ])
//   let j = 0
//   for (const driver of drivers) {
//     j++
//     if (driver.status === 'rejected') continue
//     const root = driver.value
//     await cleanupSandboxedFileSystem(root)
//     const total = performance.now()
//     for (var i = 0; i < tests.length; i++) {
//       const test = tests[i]
//       await cleanupSandboxedFileSystem(root)
//       const t = performance.now()
//       await test.fn(root).then(() => {
//         const time = (performance.now() - t).toFixed(3)
//         tBody.rows[i].cells[j].innerText = time + 'ms'
//       }, err => {
//         console.error(err)
//         tBody.rows[i].cells[j].innerText = '❌'
//         tBody.rows[i].cells[j].title = err.message
//       })
//     }
//     table.tFoot.rows[0].cells[j].innerText = (performance.now() - total).toFixed(3)
//   }
// }

// init().catch(console.error)
