#!/usr/bin/env node

import fs from 'node:fs';

const sources = [
  'whatwg/fs',
  'WICG/file-system-access'
]

async function getBytes (url) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 10000)
  try {
    const response = await fetch(url, { signal: ctrl.signal })
    if (!response.ok) {
      ctrl.abort()
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    }
    return await response.bytes()
  } finally {
    clearTimeout(timeout)
  }
}

function getJson (url) {
  return getBytes(url).then(bytes => JSON.parse(new TextDecoder().decode(bytes)))
}

// Get the last short commit hash from github
for (const source of sources) {
  const url = `https://api.github.com/repos/${source}/commits`
  const data = await getJson(url)
  const lastCommitHash = data[0].sha.substring(0, 7)

  // if the hash isn't in specs/latest.txt,
  // then fetch the spec and save it to specs/${source}-latest-${lastCommitHash}.txt
  const specPath = `specs/latest.txt`
  if (!fs.existsSync(specPath) || !fs.readFileSync(specPath, 'utf-8').includes(lastCommitHash)) {
    // remove old latest spec
    fs.rmSync(specPath, { recursive: true, force: true })
    // Get all the files in the repository at that commit
    const treeUrl = `https://api.github.com/repos/${source}/git/trees/${lastCommitHash}?recursive=1`
    const treeData = await getJson(treeUrl)
    const files = treeData.tree.filter(file => file.type === 'blob') // only get files, not directories
    // Download index.bs and everything from the proposals/ directory
    for (const file of files) {
      if (file.path === 'index.bs' || file.path.startsWith('proposals/')) {
        const fileUrl = `https://raw.githubusercontent.com/${source}/${lastCommitHash}/${file.path}`
        const fileContent = await getBytes(fileUrl)
        const savePath = `specs/${source.replace('/', '-')}/${file.path}`
        // Ensure the directory exists
        fs.mkdirSync(savePath.substring(0, savePath.lastIndexOf('/')), { recursive: true })
        // Save the file
        fs.writeFileSync(savePath, fileContent)
      }
    }
    // Save the latest commit hash to specs/latest.txt
    fs.writeFileSync(specPath, `${source}: ${lastCommitHash}\n`, { flag: 'a' })
    console.log(`Updated ${source} spec to commit ${lastCommitHash}`)
  }
}
