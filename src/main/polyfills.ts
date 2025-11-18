/**
 * Polyfills for Windows compatibility with canvas and image processing libraries
 * Prevents "DOMMatrix is not defined" and other browser API errors
 */

// Check if we're in a Node.js environment (not browser)
const isNode = typeof process !== 'undefined' &&
               process.versions &&
               process.versions.node

// Force polyfills for testing (set to true to test on macOS)
const FORCE_POLYFILLS = process.env.FORCE_POLYFILLS === 'true'

// Log platform information for debugging
if (isNode) {
  console.log('🖥️  Platform:', process.platform)
  console.log('📦 Node version:', process.version)
  console.log('🔍 DOMMatrix exists before polyfill:', typeof globalThis.DOMMatrix !== 'undefined')
  console.log('🔍 Force polyfills:', FORCE_POLYFILLS)
}

// Apply polyfills in Node.js environment or when forced
if (isNode && (process.platform === 'win32' || FORCE_POLYFILLS || typeof globalThis.DOMMatrix === 'undefined')) {
  // DOMMatrix polyfill with more complete implementation
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // @ts-ignore
    globalThis.DOMMatrix = class DOMMatrix {
      a: number = 1
      b: number = 0
      c: number = 0
      d: number = 1
      e: number = 0
      f: number = 0
      m11: number = 1
      m12: number = 0
      m13: number = 0
      m14: number = 0
      m21: number = 0
      m22: number = 1
      m23: number = 0
      m24: number = 0
      m31: number = 0
      m32: number = 0
      m33: number = 1
      m34: number = 0
      m41: number = 0
      m42: number = 0
      m43: number = 0
      m44: number = 1
      is2D: boolean = true
      isIdentity: boolean = true

      constructor(init?: string | number[] | DOMMatrixInit) {
        if (typeof init === 'string') {
          // Parse matrix string like "matrix(1,0,0,1,0,0)"
          const match = init.match(/matrix\(([^)]+)\)/)
          if (match) {
            const values = match[1].split(',').map(v => parseFloat(v.trim()))
            if (values.length >= 6) {
              this.a = this.m11 = values[0]
              this.b = this.m12 = values[1]
              this.c = this.m21 = values[2]
              this.d = this.m22 = values[3]
              this.e = this.m41 = values[4]
              this.f = this.m42 = values[5]
            }
          }
        } else if (Array.isArray(init)) {
          if (init.length >= 6) {
            this.a = this.m11 = init[0]
            this.b = this.m12 = init[1]
            this.c = this.m21 = init[2]
            this.d = this.m22 = init[3]
            this.e = this.m41 = init[4]
            this.f = this.m42 = init[5]
          }
          if (init.length === 16) {
            this.m11 = init[0]
            this.m12 = init[1]
            this.m13 = init[2]
            this.m14 = init[3]
            this.m21 = init[4]
            this.m22 = init[5]
            this.m23 = init[6]
            this.m24 = init[7]
            this.m31 = init[8]
            this.m32 = init[9]
            this.m33 = init[10]
            this.m34 = init[11]
            this.m41 = init[12]
            this.m42 = init[13]
            this.m43 = init[14]
            this.m44 = init[15]
            this.is2D = false
          }
        } else if (init && typeof init === 'object') {
          // Handle DOMMatrixInit
          if ('a' in init) this.a = this.m11 = init.a!
          if ('b' in init) this.b = this.m12 = init.b!
          if ('c' in init) this.c = this.m21 = init.c!
          if ('d' in init) this.d = this.m22 = init.d!
          if ('e' in init) this.e = this.m41 = init.e!
          if ('f' in init) this.f = this.m42 = init.f!
          if ('m11' in init) this.a = this.m11 = init.m11!
          if ('m12' in init) this.b = this.m12 = init.m12!
          if ('m21' in init) this.c = this.m21 = init.m21!
          if ('m22' in init) this.d = this.m22 = init.m22!
          if ('m41' in init) this.e = this.m41 = init.m41!
          if ('m42' in init) this.f = this.m42 = init.m42!
        }

        this.updateIdentity()
      }

      updateIdentity() {
        this.isIdentity = this.a === 1 && this.b === 0 && this.c === 0 &&
                         this.d === 1 && this.e === 0 && this.f === 0
      }

      translate(tx: number, ty: number = 0): DOMMatrix {
        this.e += tx * this.a + ty * this.c
        this.f += tx * this.b + ty * this.d
        this.m41 = this.e
        this.m42 = this.f
        this.updateIdentity()
        return this
      }

      scale(sx: number, sy?: number, sz: number = 1): DOMMatrix {
        if (sy === undefined) sy = sx
        this.a *= sx
        this.b *= sx
        this.c *= sy
        this.d *= sy
        this.m11 = this.a
        this.m12 = this.b
        this.m21 = this.c
        this.m22 = this.d
        this.updateIdentity()
        return this
      }

      rotate(angle: number): DOMMatrix {
        const rad = angle * Math.PI / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const a = this.a
        const b = this.b
        const c = this.c
        const d = this.d

        this.a = a * cos + c * sin
        this.b = b * cos + d * sin
        this.c = c * cos - a * sin
        this.d = d * cos - b * sin

        this.m11 = this.a
        this.m12 = this.b
        this.m21 = this.c
        this.m22 = this.d

        this.updateIdentity()
        return this
      }

      multiply(other: DOMMatrix): DOMMatrix {
        const a = this.a * other.a + this.c * other.b
        const b = this.b * other.a + this.d * other.b
        const c = this.a * other.c + this.c * other.d
        const d = this.b * other.c + this.d * other.d
        const e = this.a * other.e + this.c * other.f + this.e
        const f = this.b * other.e + this.d * other.f + this.f

        this.a = this.m11 = a
        this.b = this.m12 = b
        this.c = this.m21 = c
        this.d = this.m22 = d
        this.e = this.m41 = e
        this.f = this.m42 = f

        this.updateIdentity()
        return this
      }

      inverse(): DOMMatrix {
        const det = this.a * this.d - this.b * this.c
        if (det === 0) {
          throw new Error('Matrix is not invertible')
        }

        const a = this.d / det
        const b = -this.b / det
        const c = -this.c / det
        const d = this.a / det
        const e = (this.c * this.f - this.d * this.e) / det
        const f = (this.b * this.e - this.a * this.f) / det

        return new (this.constructor as any)([a, b, c, d, e, f])
      }

      toString(): string {
        if (this.is2D) {
          return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`
        }
        return `matrix3d(${this.m11}, ${this.m12}, ${this.m13}, ${this.m14}, ${this.m21}, ${this.m22}, ${this.m23}, ${this.m24}, ${this.m31}, ${this.m32}, ${this.m33}, ${this.m34}, ${this.m41}, ${this.m42}, ${this.m43}, ${this.m44})`
      }

      toFloat32Array(): Float32Array {
        if (this.is2D) {
          return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f])
        }
        return new Float32Array([
          this.m11, this.m12, this.m13, this.m14,
          this.m21, this.m22, this.m23, this.m24,
          this.m31, this.m32, this.m33, this.m34,
          this.m41, this.m42, this.m43, this.m44
        ])
      }

      toFloat64Array(): Float64Array {
        if (this.is2D) {
          return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f])
        }
        return new Float64Array([
          this.m11, this.m12, this.m13, this.m14,
          this.m21, this.m22, this.m23, this.m24,
          this.m31, this.m32, this.m33, this.m34,
          this.m41, this.m42, this.m43, this.m44
        ])
      }
    }

    // Also set it on global for compatibility
    // @ts-ignore
    global.DOMMatrix = globalThis.DOMMatrix
  }

  // DOMRect polyfill
  if (typeof globalThis.DOMRect === 'undefined') {
    // @ts-ignore
    globalThis.DOMRect = class DOMRect {
      x: number
      y: number
      width: number
      height: number
      top: number
      right: number
      bottom: number
      left: number

      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x
        this.y = y
        this.width = width
        this.height = height
        this.top = y
        this.left = x
        this.bottom = y + height
        this.right = x + width
      }

      toJSON() {
        return {
          x: this.x,
          y: this.y,
          width: this.width,
          height: this.height,
          top: this.top,
          right: this.right,
          bottom: this.bottom,
          left: this.left
        }
      }
    }

    // Also set it on global for compatibility
    // @ts-ignore
    global.DOMRect = globalThis.DOMRect
  }

  // Path2D polyfill (basic implementation)
  if (typeof globalThis.Path2D === 'undefined') {
    // @ts-ignore
    globalThis.Path2D = class Path2D {
      constructor(path?: Path2D | string) {
        // Basic stub implementation
      }

      addPath(path: any) {}
      closePath() {}
      moveTo(x: number, y: number) {}
      lineTo(x: number, y: number) {}
      bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {}
      quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {}
      arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {}
      arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {}
      ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {}
      rect(x: number, y: number, w: number, h: number) {}
    }

    // Also set it on global for compatibility
    // @ts-ignore
    global.Path2D = globalThis.Path2D
  }

  console.log('✓ Browser API polyfills loaded for Windows compatibility')
}
