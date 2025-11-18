const fs = require('fs-extra')
const path = require('path')
const { execSync } = require('child_process')

/**
 * BeforePack hook to download Windows canvas prebuild
 * This runs BEFORE electron-builder starts packaging
 */
module.exports = async function (context) {
  const { electronPlatformName } = context

  console.log('🔧 Running beforePack hook...')
  console.log('  Platform:', electronPlatformName)

  // Only run for Windows builds
  if (electronPlatformName !== 'win32') {
    console.log('  Skipping (not Windows)')
    return
  }

  console.log('  Downloading Windows canvas prebuild...')

  const canvasDir = path.join(process.cwd(), 'node_modules', 'canvas')
  const canvasBuildDir = path.join(canvasDir, 'build', 'Release')

  // Backup existing macOS canvas.node if it exists
  const canvasNode = path.join(canvasBuildDir, 'canvas.node')
  const canvasNodeBackup = path.join(canvasBuildDir, 'canvas.node.mac.backup')

  if (await fs.pathExists(canvasNode)) {
    console.log('  Backing up macOS canvas.node...')
    await fs.copy(canvasNode, canvasNodeBackup)
    await fs.remove(canvasNode)
  }

  // Remove any existing DLLs
  if (await fs.pathExists(canvasBuildDir)) {
    const files = await fs.readdir(canvasBuildDir)
    for (const file of files) {
      if (file.endsWith('.dll')) {
        await fs.remove(path.join(canvasBuildDir, file))
      }
    }
  }

  await fs.ensureDir(canvasBuildDir)

  try {
    // Get canvas version
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
          `curl -f -L "${downloadUrl}" | tar -xz -C "${canvasBuildDir}"`,
          {
            stdio: 'pipe'
          }
        )

        console.log('  ✅ Windows prebuild downloaded successfully')
        downloaded = true
        break
      } catch (err) {
        console.log(`    Failed, trying next URL...`)
      }
    }

    if (!downloaded) {
      throw new Error('No compatible prebuild found')
    }

    // Verify files were extracted
    const extractedFiles = await fs.readdir(canvasBuildDir)
    console.log(`  ✅ Extracted ${extractedFiles.length} files`)
    console.log(`  Files: ${extractedFiles.join(', ')}`)

  } catch (error) {
    console.error('  ❌ Error downloading Windows prebuild:', error.message)
    console.log('  ⚠️  Restoring macOS canvas.node...')

    // Restore macOS version
    if (await fs.pathExists(canvasNodeBackup)) {
      await fs.copy(canvasNodeBackup, canvasNode)
    }

    throw new Error('Failed to download Windows canvas prebuild')
  }

  console.log('✅ beforePack hook completed')
}
