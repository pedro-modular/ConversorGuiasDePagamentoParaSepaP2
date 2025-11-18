// Test script to verify polyfills are working
console.log('===== POLYFILLS TEST =====')
console.log('Platform:', process.platform)

// Import the polyfills
require('./out/main/index.js')

// Test DOMMatrix
console.log('\n--- Testing DOMMatrix ---')
console.log('DOMMatrix exists:', typeof globalThis.DOMMatrix !== 'undefined')

if (typeof globalThis.DOMMatrix !== 'undefined') {
  try {
    const matrix = new globalThis.DOMMatrix()
    console.log('✅ DOMMatrix created successfully')
    console.log('Matrix values:', {
      a: matrix.a,
      b: matrix.b,
      c: matrix.c,
      d: matrix.d,
      e: matrix.e,
      f: matrix.f
    })

    // Test methods
    matrix.translate(10, 20)
    console.log('✅ translate() works')

    matrix.scale(2)
    console.log('✅ scale() works')

    matrix.rotate(45)
    console.log('✅ rotate() works')

    console.log('✅ All DOMMatrix tests passed!')
  } catch (error) {
    console.error('❌ DOMMatrix test failed:', error.message)
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

console.log('\n===== END POLYFILLS TEST =====')
process.exit(0)