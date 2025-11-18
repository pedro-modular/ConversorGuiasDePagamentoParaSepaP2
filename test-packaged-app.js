#!/usr/bin/env node
/**
 * Test script to verify all dependencies are available in the packaged app
 * This helps catch missing modules before deploying to Windows
 *
 * Usage:
 *   1. Build the app: npm run build
 *   2. Run this test: node test-packaged-app.js
 */

console.log('===== TESTING PACKAGED APP DEPENDENCIES =====\n')

// Test from the built output directory
process.chdir(__dirname)

const path = require('path')
const fs = require('fs')

// Simulate running from the packaged app
const builtMainPath = path.join(__dirname, 'out', 'main', 'index.js')

if (!fs.existsSync(builtMainPath)) {
  console.error('❌ Built app not found. Please run: npm run build')
  process.exit(1)
}

console.log('✓ Built app found at:', builtMainPath)
console.log('\n--- Testing Module Imports ---\n')

// List of modules that should be available
const criticalModules = [
  'xml-js',
  'electron',
  'path',
  'fs'
]

// Modules with native bindings (expected to fail in test env, but should be packaged)
const nativeModules = [
  'canvas',
  'pdf-parse',
  'tesseract.js',
  'pdfjs-dist'
]

let allPassed = true

console.log('Critical modules (must work in test):')
for (const moduleName of criticalModules) {
  try {
    // Try to require the module
    const mod = require(moduleName)
    console.log(`✅ ${moduleName.padEnd(20)} - Available`)

    // For xml-js, verify it has the functions we need
    if (moduleName === 'xml-js') {
      if (typeof mod.js2xml !== 'function') {
        console.error(`   ❌ ${moduleName} missing js2xml function!`)
        allPassed = false
      } else {
        console.log(`   ✓ js2xml function available`)
      }
    }
  } catch (error) {
    console.error(`❌ ${moduleName.padEnd(20)} - NOT FOUND`)
    console.error(`   Error: ${error.message}`)
    allPassed = false
  }
}

console.log('\nNative modules (presence checked, not loaded):')
for (const moduleName of nativeModules) {
  // Just check if the module exists in node_modules
  const modulePath = path.join(__dirname, 'node_modules', moduleName)
  if (fs.existsSync(modulePath)) {
    console.log(`✅ ${moduleName.padEnd(20)} - Found in node_modules`)
  } else {
    console.error(`❌ ${moduleName.padEnd(20)} - NOT in node_modules`)
    allPassed = false
  }
}

console.log('\n--- Testing Built Output ---\n')

// Check if xml-js is bundled in the output
const mainContent = fs.readFileSync(builtMainPath, 'utf8')
const hasXmlJsBundled = mainContent.includes('js2xml')
const hasXmlJsRequire = mainContent.includes('require("xml-js")')

console.log('Built output analysis:')
console.log('  - Contains js2xml code:', hasXmlJsBundled ? '✅ YES (bundled)' : '⚠️  NO')
console.log('  - Contains xml-js require:', hasXmlJsRequire ? '⚠️  YES (external)' : '✅ NO (bundled)')

if (hasXmlJsRequire && !hasXmlJsBundled) {
  console.error('\n❌ WARNING: xml-js is referenced as external but might not be packaged!')
  allPassed = false
}

// Check the size of the built file
const mainSize = fs.statSync(builtMainPath).size
console.log(`\n  - Built main.js size: ${(mainSize / 1024).toFixed(2)} KB`)

if (mainSize < 10000) {
  console.error('❌ WARNING: Built file seems too small, dependencies might not be bundled!')
  allPassed = false
}

console.log('\n--- Checking Polyfills ---\n')

const hasPolyfills = mainContent.includes('DOMMatrix') && mainContent.includes('polyfill')
console.log('  - DOMMatrix polyfill included:', hasPolyfills ? '✅ YES' : '❌ NO')

if (!hasPolyfills) {
  console.error('❌ WARNING: Polyfills might not be included!')
  allPassed = false
}

console.log('\n--- Checking PDF.js Worker URL Fix ---\n')

const hasPathToFileURL = mainContent.includes('pathToFileURL')
const hasWorkerUrl = mainContent.includes('workerUrl')
console.log('  - pathToFileURL import:', hasPathToFileURL ? '✅ YES' : '❌ NO')
console.log('  - workerUrl conversion:', hasWorkerUrl ? '✅ YES' : '❌ NO')

if (!hasPathToFileURL || !hasWorkerUrl) {
  console.error('❌ WARNING: PDF.js worker URL fix might not be applied!')
  console.error('   This will cause OCR to fail on Windows with "Only URLs with a scheme in: file" error')
  allPassed = false
}

console.log('\n===== TEST SUMMARY =====\n')

if (allPassed) {
  console.log('✅ All tests PASSED! App should work on Windows.')
  console.log('\n📦 Safe to package for Windows: npm run package:win')
  process.exit(0)
} else {
  console.error('❌ Some tests FAILED! Fix issues before packaging for Windows.')
  console.log('\n🔧 Please review the errors above and rebuild.')
  process.exit(1)
}
