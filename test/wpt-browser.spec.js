import { test, expect } from '@playwright/test'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import expectedFailures from './wpt-expected-failures.json' with { type: 'json' }

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Skipped scripts and their reasons
const SKIP_REASONS = {
  'FileSystemObserver.js': 'FileSystemObserver not implemented',
  'FileSystemObserver-writable-file-stream.js': 'FileSystemObserver not implemented',
  'FileSystemFileHandle-create-sync-access-handle.js': 'SyncAccessHandle is OPFS-only',
  'FileSystemSyncAccessHandle-flush.js': 'SyncAccessHandle is OPFS-only',
  'FileSystemBaseHandle-buckets.js': 'Storage buckets API not applicable',
  'FileSystemBaseHandle-IndexedDB.js': 'Browser-only (postMessage + IDB)',
  'FileSystemBaseHandle-postMessage-BroadcastChannel.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-Error.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-frames.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-MessagePort-frames.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-MessagePort-windows.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-MessagePort-workers.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-windows.js': 'Browser-only (postMessage)',
  'FileSystemBaseHandle-postMessage-workers.js': 'Browser-only (postMessage)',
}

// WPT test scripts that are compatible with the polyfill's memory adapter.
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
  'FileSystemBaseHandle-remove.js',
  'FileSystemFileHandle-move.js',
  'FileSystemBaseHandle-getUniqueId.js',
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

// Get all available WPT scripts to determine coverage
function getAllAvailableScripts () {
  if (!wptAvailable) return []
  return readdirSync(wptDir)
}

function getSkippedScripts () {
  if (!wptAvailable) return []
  const files = readdirSync(wptDir)
  return Object.keys(SKIP_REASONS).filter(s => files.includes(s))
}

const skippedScripts = getSkippedScripts()

test.describe('WPT File System Tests', () => {
  test.skip(!wptAvailable, 'WPT tests not fetched. Run: bash scripts/fetch-wpt.sh')

  // Create skipped test blocks for scripts that are not implemented
  // These will appear in Playwright HTML report as skipped with reason
  for (const scriptName of skippedScripts) {
    test.describe.skip(scriptName, () => {
      test('skipped', async ({}) => {}, { reason: SKIP_REASONS[scriptName] })
    })
  }

  for (const scriptName of scripts) {
    test(scriptName, async ({ page }) => {
      // Listen for console messages to track test progress
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.error(`  [browser error] ${msg.text()}`)
        }
      })

      // Navigate to the test page with this script
      const url = `/test/wpt-test-page.html?dir=fs&scripts=${encodeURIComponent(scriptName)}`
      await page.goto(url)

      // Wait for results to be collected by the completion callback
      // The test page stores results in window.__wptResults when done
      const results = await page.evaluate(() => {
        return new Promise((resolve) => {
          const checkResults = () => {
            if (window.__wptResults !== null) {
              resolve(window.__wptResults)
            } else {
              setTimeout(checkResults, 100)
            }
          }
          checkResults()
          // Fallback timeout after 60 seconds
          setTimeout(() => resolve(window.__wptResults || []), 60000)
        })
      })

      // Report individual results
      const passed = results.filter(result => result.status === 0)
      const failed = results.filter(result => result.status !== 0)

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

      // Guard against silent failures (page error, timeout, no tests loaded)
      // Without this, unexpectedFailures would be vacuously empty if results is empty.
      expect(results.length).toBeGreaterThan(0)

      // Fail if any WPT subtest failure is not in the expected-failures allowlist
      const allowedFailures = expectedFailures[scriptName] || []
      const unexpectedFailures = failed.filter(
        failure => !allowedFailures.some(entry => entry.name === failure.name)
      )
      for (const failure of unexpectedFailures) {
        console.error(`  UNEXPECTED FAILURE: [${scriptName}] ${failure.name}${failure.message ? ': ' + failure.message : ''}`)
      }
      expect(unexpectedFailures).toHaveLength(0)
    })
  }
})
