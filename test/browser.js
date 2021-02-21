const tape = require('tape')
const steps = require('./test.js')
console.log(steps)
// Promise.all([
//   import('/test.js'),
//   import('/src/getOriginPrivateDirectory.js')
// ]).then(([steps, getOriginPrivateDirectory]) => {
//   console.log(steps)
// })

// getOriginPrivateDirectory(import('../src/adapters/memory.js')).then(async root => {
//   steps.forEach(step => {
//     if (step.desc.includes('atomic')) return
//     // if (step.desc !== 'cursor position: truncate size > offset') return
//     test(step.desc, async function (t) {
//       await cleanupSandboxedFileSystem(root)
//       await step.fn(root)
//       t.end()
//     })
//   })
// })

// async function cleanupSandboxedFileSystem (root) {
//   for await (let entry of root.entries()) {
//     await root.removeEntry(entry.name, { recursive: entry.kind === 'directory' })
//   }
// }
