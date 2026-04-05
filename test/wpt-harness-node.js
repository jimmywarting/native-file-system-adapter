/**
 * Minimal WPT testharness implementation for Node.js.
 * Implements the subset of WPT testharness.js functions used by
 * the File System Access API test scripts.
 */

const results = []
let currentTest = null

// ──────────────────────────────────────────────────────
// Assertion functions
// ──────────────────────────────────────────────────────

export function assert_true (actual, description) {
  if (actual !== true) {
    throw new Error(`assert_true: ${description || ''} expected true got ${actual}`)
  }
}

export function assert_false (actual, description) {
  if (actual !== false) {
    throw new Error(`assert_false: ${description || ''} expected false got ${actual}`)
  }
}

export function assert_equals (actual, expected, description) {
  if (!Object.is(actual, expected)) {
    throw new Error(`assert_equals: ${description || ''} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`)
  }
}

export function assert_not_equals (actual, unexpected, description) {
  if (Object.is(actual, unexpected)) {
    throw new Error(`assert_not_equals: ${description || ''} got unexpected value ${JSON.stringify(actual)}`)
  }
}

export function assert_array_equals (actual, expected, description) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) {
    throw new Error(`assert_array_equals: ${description || ''} expected arrays`)
  }
  if (actual.length !== expected.length) {
    throw new Error(`assert_array_equals: ${description || ''} lengths differ: ${actual.length} vs ${expected.length}. Actual: [${actual}], Expected: [${expected}]`)
  }
  for (let i = 0; i < actual.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      throw new Error(`assert_array_equals: ${description || ''} differ at index ${i}: ${JSON.stringify(actual[i])} vs ${JSON.stringify(expected[i])}`)
    }
  }
}

export function assert_unreached (description) {
  throw new Error(`assert_unreached: ${description || 'should not be reached'}`)
}

export function assert_throws_dom (name, fn, description) {
  try {
    fn()
  } catch (e) {
    if (e instanceof DOMException && e.name === name) {
      return
    }
    if (e.name === name) {
      return
    }
    throw new Error(`assert_throws_dom: ${description || ''} expected DOMException "${name}" but got ${e.name}: ${e.message}`)
  }
  throw new Error(`assert_throws_dom: ${description || ''} expected DOMException "${name}" but no exception was thrown`)
}

export function assert_throws_js (constructor, fn, description) {
  try {
    fn()
  } catch (e) {
    if (e instanceof constructor) {
      return
    }
    throw new Error(`assert_throws_js: ${description || ''} expected ${constructor.name} but got ${e.constructor.name}: ${e.message}`)
  }
  throw new Error(`assert_throws_js: ${description || ''} expected ${constructor.name} but no exception was thrown`)
}

export async function promise_rejects_dom (t, name, promise, description) {
  try {
    await promise
  } catch (e) {
    if (e instanceof DOMException && e.name === name) {
      return
    }
    if (e.name === name) {
      return
    }
    throw new Error(`promise_rejects_dom: ${description || ''} expected DOMException "${name}" but got ${e.name}: ${e.message}`)
  }
  throw new Error(`promise_rejects_dom: ${description || ''} expected DOMException "${name}" but resolved successfully`)
}

export async function promise_rejects_js (t, constructor, promise, description) {
  try {
    await promise
  } catch (e) {
    if (e instanceof constructor) {
      return
    }
    throw new Error(`promise_rejects_js: ${description || ''} expected ${constructor.name} but got ${e.constructor.name}: ${e.message}`)
  }
  throw new Error(`promise_rejects_js: ${description || ''} expected ${constructor.name} but resolved successfully`)
}

export async function promise_rejects_exactly (t, expected, promise, description) {
  try {
    await promise
  } catch (e) {
    if (e === expected) {
      return
    }
    throw new Error(`promise_rejects_exactly: ${description || ''} expected exactly ${expected} but got ${e}`)
  }
  throw new Error(`promise_rejects_exactly: ${description || ''} expected rejection but resolved successfully`)
}

// ──────────────────────────────────────────────────────
// Test registration functions
// ──────────────────────────────────────────────────────

export function promise_test (fn, description) {
  results.push({ fn, description, type: 'promise' })
}

export function test_fn (fn, description) {
  results.push({ fn, description, type: 'sync' })
}

export function setup (opts) {
  // No-op in Node.js - used for browser configuration
}

export function done () {
  // No-op in Node.js
}

// ──────────────────────────────────────────────────────
// Test runner
// ──────────────────────────────────────────────────────

export async function runTests () {
  let passed = 0
  let failed = 0
  let total = 0
  const failures = []

  for (const entry of results) {
    total++
    const cleanups = []
    const t = {
      name: entry.description,
      add_cleanup (fn) { cleanups.push(fn) },
      step_func (fn) { return fn },
      step_func_done (fn) { return fn },
      step_timeout (fn, ms) { return setTimeout(fn, ms) },
      unreached_func (msg) { return () => { throw new Error(`unreached: ${msg}`) } },
    }

    try {
      if (entry.type === 'promise') {
        await entry.fn(t)
      } else {
        entry.fn(t)
      }
      passed++
      console.log(`  \x1b[32m✓\x1b[0m ${entry.description}`)
    } catch (err) {
      failed++
      console.log(`  \x1b[31m✗\x1b[0m ${entry.description}`)
      console.log(`    ${err.message}`)
      failures.push({ description: entry.description, error: err })
    } finally {
      // Run cleanups in reverse order
      for (const cleanup of cleanups.reverse()) {
        try { await cleanup() } catch (e) { /* ignore cleanup errors */ }
      }
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed, ${total} total\n`)

  // Clear results for next script
  results.length = 0

  return { passed, failed, total, failures }
}

// ──────────────────────────────────────────────────────
// Install all globals
// ──────────────────────────────────────────────────────

export function installGlobals () {
  Object.assign(globalThis, {
    assert_true,
    assert_false,
    assert_equals,
    assert_not_equals,
    assert_array_equals,
    assert_unreached,
    assert_throws_dom,
    assert_throws_js,
    promise_rejects_dom,
    promise_rejects_js,
    promise_rejects_exactly,
    promise_test,
    test: test_fn,
    setup,
    done,
  })
}
