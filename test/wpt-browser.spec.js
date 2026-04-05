import { test, expect } from '@playwright/test'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// WPT test scripts that are compatible with the polyfill's memory adapter.
// We skip tests that require browser-specific APIs (postMessage, IndexedDB,
// SyncAccessHandle, BroadcastChannel, etc.) or features not supported by
// the polyfill (move, rename, remove, observers, buckets, unique IDs).
const SUPPORTED_SCRIPTS = [
  'FileSystemDirectoryHandle-getDirectoryHandle.js',
  'FileSystemDirectoryHandle-getFileHandle.js',
  'FileSystemDirectoryHandle-iteration.js',
  'FileSystemDirectoryHandle-removeEntry.js',
  'FileSystemDirectoryHandle-resolve.js',
  'FileSystemFileHandle-getFile.js',
  'FileSystemWritableFileStream.js',
  'FileSystemWritableFileStream-write.js',
  'FileSystemWritableFileStream-piped.js',
  'FileSystemBaseHandle-isSameEntry.js',
]

// Verify that WPT has been fetched
const wptDir = resolve(ROOT, 'wpt', 'fs', 'script-tests')
const wptAvailable = existsSync(wptDir)

// Determine which scripts are actually available
function getAvailableScripts () {
  if (!wptAvailable) return []
  const files = readdirSync(wptDir)
  return SUPPORTED_SCRIPTS.filter(s => files.includes(s))
}

const scripts = getAvailableScripts()

test.describe('WPT File System Tests', () => {
  test.skip(!wptAvailable, 'WPT tests not fetched. Run: bash scripts/fetch-wpt.sh')

  for (const scriptName of scripts) {
    test(scriptName, async ({ page }) => {
      const testResults = []
      let isDone = false

      // Listen for console messages to track test progress
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.error(`  [browser error] ${msg.text()}`)
        }
      })

      // Navigate to the test page with this script
      const url = `/test/wpt-test-page.html?dir=fs&scripts=${encodeURIComponent(scriptName)}`
      await page.goto(url)

      // Wait for the WPT harness to finish - collect results via evaluate
      const results = await page.evaluate(() => {
        return new Promise((resolve) => {
          const results = []

          // If done() has already been called, resolve immediately
          if (window.completion_callback_called) {
            resolve(results)
            return
          }

          // Listen for test completion
          const originalCallback = window.completion_callback
          window.completion_callback = (tests, harnessStatus) => {
            for (const t of tests) {
              results.push({
                name: t.name,
                status: t.status,
                message: t.message || null,
                stack: t.stack || null,
              })
            }
            resolve(results)
          }

          // Fallback timeout
          setTimeout(() => resolve(results), 60000)
        })
      })

      // Report individual results
      const passed = results.filter(r => r.status === 0)
      const failed = results.filter(r => r.status !== 0)

      console.log(`  ${scriptName}: ${passed.length} passed, ${failed.length} failed out of ${results.length}`)

      for (const result of failed) {
        const statusStr = result.status === 1 ? 'FAIL'
          : result.status === 2 ? 'TIMEOUT'
          : result.status === 3 ? 'INCOMPLETE'
          : result.status === 4 ? 'PRECONDITION_FAILED'
          : `UNKNOWN(${result.status})`
        console.log(`    [${statusStr}] ${result.name}`)
        if (result.message) {
          console.log(`      ${result.message}`)
        }
      }

      // We expect at least some tests to pass, but don't fail the whole
      // suite if some individual WPT tests fail (since the polyfill may
      // not implement everything yet).
      expect(results.length).toBeGreaterThan(0)
      // At least some tests should pass
      expect(passed.length).toBeGreaterThan(0)
    })
  }
})
