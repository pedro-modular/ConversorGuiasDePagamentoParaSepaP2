import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [
      // Use externalizeDepsPlugin but exclude xml-js so it gets bundled
      externalizeDepsPlugin({
        exclude: ['xml-js']
      })
    ],
    build: {
      rollupOptions: {
        external: [
          // Only keep truly external dependencies
          // xml-js is excluded so it will be bundled
          'electron',
          'canvas',
          'pdf-parse',
          'tesseract.js',
          'pdfjs-dist'
        ]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    plugins: [react()]
  }
})
