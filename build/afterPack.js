const fs = require('fs-extra')
const path = require('path')
const { execSync } = require('child_process')

/**
 * AfterPack hook to download and install Windows canvas prebuild
 * This runs AFTER electron-builder packages, directly into the output
 */
module.exports = async function (context) {
  const { electronPlatformName, appOutDir } = context

  console.log('🔧 Running afterPack hook...')

  // Only run for Windows builds
  if (electronPlatformName !== 'win32') {
    console.log('  Skipping (not Windows)')
    return
  }

  console.log('  Installing Windows canvas prebuild into package...')

  const resourcesDir = path.join(appOutDir, 'resources')
  const appAsarUnpackedDir = path.join(resourcesDir, 'app.asar.unpacked')
  const canvasTargetDir = path.join(appAsarUnpackedDir, 'node_modules', 'canvas')
  const canvasBuildDir = path.join(canvasTargetDir, 'build', 'Release')

  await fs.ensureDir(canvasBuildDir)

  // Remove macOS files from the package
  console.log('  Removing macOS canvas files...')

  if (await fs.pathExists(canvasBuildDir)) {
    const files = await fs.readdir(canvasBuildDir)
    for (const file of files) {
      if (file.endsWith('.dylib') || file === 'canvas.node' || file.endsWith('.mac.backup')) {
        await fs.remove(path.join(canvasBuildDir, file))
      }
    }
  }

  // Download Windows prebuild
  console.log('  Downloading Windows canvas prebuild...')

  try {
    const canvasVersion = require('../package.json').dependencies.canvas.replace('^', '')
    const nodeAbi = '127' // Electron 39 = Node 22 = ABI 127

    const downloadUrls = [
      `https://github.com/Automattic/node-canvas/releases/download/v${canvasVersion}/canvas-v${canvasVersion}-napi-v7-win32-x64.tar.gz`
    ]

    let downloaded = false

    for (const downloadUrl of downloadUrls) {
      try {
        console.log(`    Trying: ${downloadUrl}`)

        execSync(
          `curl -f -L "${downloadUrl}" | tar -xz --strip-components=2 -C "${canvasBuildDir}"`,
          {
            stdio: 'pipe'
          }
        )

        console.log('  ✅ Windows prebuild downloaded')
        downloaded = true
        break
      } catch (err) {
        console.log(`    Failed, trying next...`)
      }
    }

    if (!downloaded) {
      throw new Error('No compatible prebuild found')
    }

    // Verify Windows files were extracted
    const extractedFiles = await fs.readdir(canvasBuildDir)
    const hasCanvasNode = extractedFiles.includes('canvas.node')
    const dllCount = extractedFiles.filter(f => f.endsWith('.dll')).length

    console.log(`  ✅ Extracted ${extractedFiles.length} files (canvas.node: ${hasCanvasNode}, DLLs: ${dllCount})`)

    if (!hasCanvasNode) {
      throw new Error('canvas.node not found after extraction!')
    }

    // Copy DLLs to app root so Windows can find them
    console.log('  Copying DLLs to app root...')

    const dllFiles = extractedFiles.filter(f => f.endsWith('.dll'))
    for (const dll of dllFiles) {
      const source = path.join(canvasBuildDir, dll)
      const target = path.join(appOutDir, dll)
      await fs.copy(source, target)
    }

    console.log(`  ✅ Copied ${dllFiles.length} DLLs to app root`)

  } catch (error) {
    console.error('  ❌ Error installing Windows prebuild:', error.message)
    console.log('  ⚠️  Canvas may not work on Windows')
    console.log('  ⚠️  PDF OCR will be limited')
  }

  // Verify Tesseract language files are unpacked
  console.log('  Verifying Tesseract language files...')
  const tesseractDataDir = path.join(appAsarUnpackedDir, 'node_modules', '@tesseract.js-data', 'por', '4.0.0')
  const langFilePath = path.join(tesseractDataDir, 'por.traineddata.gz')

  if (await fs.pathExists(langFilePath)) {
    const stats = await fs.stat(langFilePath)
    console.log(`  ✅ Tesseract language file found (${Math.round(stats.size / 1024)} KB)`)
  } else {
    console.error('  ❌ WARNING: Tesseract language file NOT found!')
    console.error(`     Expected: ${langFilePath}`)

    // Try to copy it manually from source
    const sourceDir = path.join(__dirname, '..', 'node_modules', '@tesseract.js-data')
    if (await fs.pathExists(sourceDir)) {
      console.log('  📦 Copying Tesseract language files from source...')
      const targetDir = path.join(appAsarUnpackedDir, 'node_modules', '@tesseract.js-data')
      await fs.copy(sourceDir, targetDir, { overwrite: true })
      console.log('  ✅ Tesseract language files copied')
    } else {
      console.error('  ❌ Source language files not found!')
    }
  }

  console.log('✅ afterPack hook completed')
}
