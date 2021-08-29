import * as fs from '../src/es6.js'
import tests from '../test/test.js'
import {
  cleanupSandboxedFileSystem,
  getDirectoryEntryCount,
  assert
} from '../test/util.js'

const {
  showDirectoryPicker,
  showOpenFilePicker,
  showSaveFilePicker,
  getOriginPrivateDirectory
} = fs

globalThis.fs = fs

if (!Blob.prototype.text) {
  Blob.prototype.text = function () {
    return new Response(this).text()
  }
  Blob.prototype.arrayBuffer = function () {
    return new Response(this).arrayBuffer()
  }
  Blob.prototype.stream = function () {
    return new Response(this).body
  }
}

let err
const tBody = document.querySelector('#table').tBodies[0]

/** @param {{desc: string}} n */
function t (n) {
  const tr = tBody.insertRow()
  const td = tr.insertCell()
  td.innerText = n.desc
  tr.insertCell()
  tr.insertCell()
  tr.insertCell()
  tr.insertCell()
  tr.insertCell()
}

tests.forEach(t)

function tt (n, html) {
  const tr = manualTest.tBodies[0].insertRow()
  tr.insertCell().innerText = n
  tr.insertCell().appendChild(html())
}

function dt (files) {
  const b = new ClipboardEvent('').clipboardData || new DataTransfer()
  for (let i = 0, len = files.length; i < len; i++) b.items.add(files[i])
  return b
}

try {
  if (DataTransferItem.prototype.getAsFileSystemHandle.toString().includes('native'))
    throw new Error(`Don't work with mocked data`)

  const dataTransfer = dt([
    new File(['content'], 'sample1.txt'),
    new File(['abc'], 'sample2.txt')
  ])

  // https://github.com/WICG/file-system-access/pull/192#issuecomment-847426013
  for (const item of dataTransfer.items) {
    item.getAsFileSystemHandle().then(handle => {
      assert(handle.kind === 'file')
      assert(handle[Symbol.toStringTag] === 'FileSystemFileHandle')
    })
  }
} catch (err) {}

// get some dummy gradient image
function img (format) {
  const a = document.createElement('canvas')
  const b = a.getContext('2d')
  const c = b.createLinearGradient(0, 0, 1500, 1500)
  a.width = a.height = 3000
  c.addColorStop(0, 'red')
  c.addColorStop(1, 'blue')
  b.fillStyle = c
  b.fillRect(0, 0, a.width, a.height)
  return new Promise(rs => {
    a.toBlob(rs, 'image/' + format, 1)
  })
}

$types1.value = JSON.stringify([
  {
    description: 'Text Files',
    accept: {
      'text/plain': ['.txt', '.text'],
      'text/html': ['.html', '.htm']
    }
  },
  {
    description: 'Images',
    accept: {
      'image/*': ['.png', '.gif', '.jpeg', '.jpg']
    }
  }
], null, 2)

$types2.value = JSON.stringify([
  { accept: { 'image/jpg': ['.jpg'] } },
  { accept: { 'image/png': ['.png'] } },
  { accept: { 'image/webp': ['.webp'] } }
], null, 2)

form_showDirectoryPicker.onsubmit = evt => {
  evt.preventDefault()
  /** @type {Object<string, *>} */
  const opts = Object.fromEntries([...new FormData(evt.target)])
  opts._preferPolyfill = !!opts._preferPolyfill
  showDirectoryPicker(opts).then(showFileStructure, console.error)
}
form_showOpenFilePicker.onsubmit = evt => {
  evt.preventDefault()
  /** @type {Object<string, *>} */
  const opts = Object.fromEntries([...new FormData(evt.target)])
  opts.types = JSON.parse(opts.types || '""')
  opts._preferPolyfill = !!opts._preferPolyfill
  showOpenFilePicker(opts).then(handles => {
    console.log(handles)
    alert(handles)
  }, err => {
    console.error(err)
    alert(err)
  })
}
form_showSaveFilePicker.onsubmit = async evt => {
  evt.preventDefault()
  /** @type {Object<string, *>} */
  const opts = Object.fromEntries([...new FormData(evt.target)])
  opts.types = JSON.parse(opts.types || '""')
  opts._preferPolyfill = !!opts._preferPolyfill
  const handle = await showSaveFilePicker(opts)
  const format = handle.name.split('.').pop()
  const image = await img(format)
  const ws = await handle.createWritable()
  await ws.write(image)
  await ws.close()
}

async function init () {
  const drivers = await Promise.allSettled([
    getOriginPrivateDirectory(),
    getOriginPrivateDirectory(import('../src/adapters/sandbox.js')),
    getOriginPrivateDirectory(import('../src/adapters/memory.js')),
    getOriginPrivateDirectory(import('../src/adapters/indexeddb.js')),
    getOriginPrivateDirectory(import('../src/adapters/cache.js'))
  ])
  let j = 0
  for (const driver of drivers) {
    j++
    if (driver.status === 'rejected') {
      console.error('Driver failed to load:' + driver.reason)
      continue
    }
    const root = driver.value
    await cleanupSandboxedFileSystem(root)
    const total = performance.now()
    for (var i = 0; i < tests.length; i++) {
      const test = tests[i]
      await cleanupSandboxedFileSystem(root)
      const t = performance.now()
      await test.fn(root).then(() => {
        const time = (performance.now() - t).toFixed(3)
        tBody.rows[i].cells[j].innerText = time + 'ms'
      }, err => {
        console.error(err)
        tBody.rows[i].cells[j].innerText = '❌'
        tBody.rows[i].cells[j].title = err.message
      })
    }
    table.tFoot.rows[0].cells[j].innerText = (performance.now() - total).toFixed(3)
  }
}

init().catch(console.error)

globalThis.ondragover = evt => evt.preventDefault()
globalThis.ondrop = async evt => {
  evt.preventDefault()

  for (const item of evt.dataTransfer.items) {
    item.getAsFileSystemHandle().then(async handle => {
      if (handle.kind === 'directory') {
        showFileStructure(handle)
      } else {
        const file = await handle.getFile()
        console.log(file)
        alert(file)
      }
    })
  }
}

/** @param {fs.FileSystemDirectoryHandle} root */
async function showFileStructure (root) {
  const result = []
  let cwd = ''

  /** @type {HTMLInputElement} */
  const input = document.querySelector('[form=form_showOpenFilePicker][name="_preferPolyfill"]')
  const readonly = input.checked

  try {
    readonly && assert(await getDirectoryEntryCount(root) > 0)
    readonly && assert(await root.requestPermission({ writable: true }) === 'denied')
    const dirs = [root]

    for (const dir of dirs) {
      cwd += dir.name + '/'
      for await (const [name, handle] of dir) {
        // Everything should be read only
        readonly && assert(await handle.requestPermission({ writable: true }) === 'denied')
        readonly && assert(await handle.requestPermission({ readable: true }) === 'granted')
        if (handle.kind === 'file') {
          result.push(cwd + handle.name)
          readonly && (err = await capture(handle.createWritable()))
          readonly && assert(err.name === 'NotAllowedError')
        } else {
          result.push(cwd + handle.name + '/')
          assert(handle.kind === 'directory')
          dirs.push(handle)
        }
      }
    }
    const json = JSON.stringify(result.sort(), null, 2)
    console.log(json)
    alert('assertion succeed\n' + json)
  } catch (err) {
    console.log(err)
    alert('assertion failed - see console')
  }
}
