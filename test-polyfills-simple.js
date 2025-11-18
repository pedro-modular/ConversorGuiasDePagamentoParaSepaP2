// Simple test for polyfills without Electron dependency
console.log('===== POLYFILLS TEST =====')
console.log('Platform:', process.platform)
console.log('Testing with FORCE_POLYFILLS:', process.env.FORCE_POLYFILLS)

// Import just the polyfills
require('./src/main/polyfills')

// Test DOMMatrix
console.log('\n--- Testing DOMMatrix ---')
console.log('DOMMatrix exists:', typeof globalThis.DOMMatrix !== 'undefined')

if (typeof globalThis.DOMMatrix !== 'undefined') {
  try {
    const matrix = new globalThis.DOMMatrix()
    console.log('✅ DOMMatrix created successfully')
    console.log('Matrix initial values:', {
      a: matrix.a,
      b: matrix.b,
      c: matrix.c,
      d: matrix.d,
      e: matrix.e,
      f: matrix.f
    })

    // Test with array initialization
    const matrix2 = new globalThis.DOMMatrix([2, 0, 0, 2, 10, 20])
    console.log('✅ DOMMatrix with array init:', {
      a: matrix2.a,
      b: matrix2.b,
      c: matrix2.c,
      d: matrix2.d,
      e: matrix2.e,
      f: matrix2.f
    })

    // Test methods
    matrix.translate(10, 20)
    console.log('✅ translate() works')

    matrix.scale(2)
    console.log('✅ scale() works')

    matrix.rotate(45)
    console.log('✅ rotate() works')

    const str = matrix.toString()
    console.log('✅ toString() works:', str)

    console.log('✅ All DOMMatrix tests passed!')
  } catch (error) {
    console.error('❌ DOMMatrix test failed:', error.message)
    console.error(error.stack)
  }
} else {
  console.error('❌ DOMMatrix not available')
}

// Test DOMRect
console.log('\n--- Testing DOMRect ---')
console.log('DOMRect exists:', typeof globalThis.DOMRect !== 'undefined')

if (typeof globalThis.DOMRect !== 'undefined') {
  try {
    const rect = new globalThis.DOMRect(10, 20, 100, 50)
    console.log('✅ DOMRect created successfully')
    console.log('Rect values:', rect.toJSON())
    console.log('✅ All DOMRect tests passed!')
  } catch (error) {
    console.error('❌ DOMRect test failed:', error.message)
  }
} else {
  console.error('❌ DOMRect not available')
}

// Test Path2D
console.log('\n--- Testing Path2D ---')
console.log('Path2D exists:', typeof globalThis.Path2D !== 'undefined')

if (typeof globalThis.Path2D !== 'undefined') {
  try {
    const path = new globalThis.Path2D()
    path.moveTo(0, 0)
    path.lineTo(100, 100)
    console.log('✅ Path2D created and methods work')
    console.log('✅ All Path2D tests passed!')
  } catch (error) {
    console.error('❌ Path2D test failed:', error.message)
  }
} else {
  console.error('❌ Path2D not available')
}

// Also test on global object
console.log('\n--- Testing on global object ---')
console.log('global.DOMMatrix exists:', typeof global.DOMMatrix !== 'undefined')
console.log('global.DOMRect exists:', typeof global.DOMRect !== 'undefined')
console.log('global.Path2D exists:', typeof global.Path2D !== 'undefined')

console.log('\n===== END POLYFILLS TEST =====')
process.exit(0)