/**
 * Type definitions for polyfilled browser APIs in Node.js
 */

interface DOMMatrixInit {
  a?: number
  b?: number
  c?: number
  d?: number
  e?: number
  f?: number
  m11?: number
  m12?: number
  m21?: number
  m22?: number
  m41?: number
  m42?: number
}

declare global {
  interface Window {
    DOMMatrix: typeof DOMMatrix
    DOMRect: typeof DOMRect
    Path2D: typeof Path2D
  }

  interface GlobalThis {
    DOMMatrix: typeof DOMMatrix
    DOMRect: typeof DOMRect
    Path2D: typeof Path2D
  }

  // Ensure these are available in Node.js global scope
  var DOMMatrix: {
    new (init?: string | number[] | DOMMatrixInit): DOMMatrix
  }

  var DOMRect: {
    new (x?: number, y?: number, width?: number, height?: number): DOMRect
  }

  var Path2D: {
    new (path?: Path2D | string): Path2D
  }
}

export {}