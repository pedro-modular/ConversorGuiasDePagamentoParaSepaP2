// IMPORTANT: Load polyfills FIRST before any other imports
// This prevents "DOMMatrix is not defined" errors on Windows
import './polyfills'

import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { generateSepaXml } from './sepaGenerator'
import { generatePS2 } from './ps2Generator'
import { PaymentData, ExportFormat } from '../shared/types'
import { logger } from './logger'

// Use require for CommonJS modules in Electron
// pdf-parse v1.1.1 uses simple default export
const pdfParse = require('pdf-parse')
const Tesseract = require('tesseract.js')
// pdf-to-img will be dynamically imported when needed (ESM module with top-level await)

let mainWindow: BrowserWindow | null = null

// Handle unhandled promise rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit the process, just log the error
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Initialize logger first
  await logger.init()
  await logger.info('Application starting')
  await logger.info('Environment', {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    isDev: process.env.NODE_ENV === 'development'
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('get-app-version', async () => {
  // Read version from package.json (single source of truth)
  return app.getVersion()
})

ipcMain.handle('get-log-path', async () => {
  // Return the path to the debug log file
  return logger.getLogPath()
})

ipcMain.handle('open-log-file', async () => {
  // Open the log file in the default text editor
  const { shell } = require('electron')
  const logPath = logger.getLogPath()
  await logger.info('Opening log file', { logPath })
  await shell.openPath(logPath)
  return { success: true, path: logPath }
})

ipcMain.handle('select-pdf-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  })

  if (result.canceled) {
    return []
  }

  return result.filePaths
})

ipcMain.handle('parse-pdf-file', async (_event, filePath: string) => {
  await logger.section(`Processing PDF: ${filePath}`)

  try {
    await logger.info('Reading PDF file')
    const buffer = await fs.readFile(filePath)
    await logger.info('PDF file read successfully', { size: buffer.length })
    let text = ''

    // Try text extraction first
    try {
      await logger.info('Attempting text extraction with pdf-parse')
      const data = await pdfParse(buffer)
      text = data.text || ''
      await logger.info('Text extraction result', {
        characters: text.length,
        preview: text.substring(0, 200)
      })
    } catch (err) {
      await logger.warn('Text extraction failed', err)
    }

    // If no text found or very little text, use OCR
    if (text.trim().length < 50) {
      await logger.info('Text extraction insufficient, starting OCR process')

      try {
        await logger.info('Step 1: Converting PDF to image')

        // Use dynamic import for pdfjs-dist ES module
        await logger.debug('Importing pdfjs-dist module')
        const pdfjsLib = await import('pdfjs-dist')
        await logger.debug('pdfjs-dist imported successfully')

        await logger.debug('Loading canvas module')
        const canvasModule = require('canvas')
        const { createCanvas } = canvasModule
        await logger.debug('Canvas module loaded successfully')

        const path = require('path')
        const { pathToFileURL } = require('url')

        // Configure worker for ES module build
        // On Windows, we need to convert the path to a file:// URL for ESM loader
        const workerPath = path.join(__dirname, '../../node_modules/pdfjs-dist/build/pdf.worker.mjs')
        const workerUrl = pathToFileURL(workerPath).href
        await logger.debug('PDF.js worker path', { workerPath, workerUrl })
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

        // Convert Buffer to Uint8Array for pdfjs-dist
        const uint8Array = new Uint8Array(buffer)

        // Create a custom canvas factory for Node.js
        const canvasFactory = {
          create(width: number, height: number) {
            const canvas = createCanvas(width, height)
            return {
              canvas,
              context: canvas.getContext('2d')
            }
          },
          reset(canvasAndContext: any, width: number, height: number) {
            canvasAndContext.canvas.width = width
            canvasAndContext.canvas.height = height
          },
          destroy(canvasAndContext: any) {
            canvasAndContext.canvas.width = 0
            canvasAndContext.canvas.height = 0
          }
        }

        // Load PDF document with canvas factory
        const loadingTask = pdfjsLib.getDocument({
          data: uint8Array,
          canvasFactory,
          useSystemFonts: true,
          disableFontFace: false,
          standardFontDataUrl: path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/')
        })
        const pdfDoc = await loadingTask.promise

        // Get the first page
        const page = await pdfDoc.getPage(1)

        // Set scale for better OCR quality
        const scale = 2.0
        const viewport = page.getViewport({ scale })

        // Create canvas with dimensions
        const canvas = createCanvas(viewport.width, viewport.height)
        const context = canvas.getContext('2d')

        // Render PDF page to canvas with canvas factory
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvasFactory
        }

        await page.render(renderContext).promise

        // Convert canvas to buffer for OCR
        await logger.debug('Converting canvas to PNG buffer')
        const firstPage = canvas.toBuffer('image/png')

        if (!firstPage) {
          throw new Error('Não foi possível converter PDF para imagem')
        }

        await logger.info('PDF converted to image successfully', { imageSize: firstPage.length })
        await logger.info('Step 2: Running Tesseract OCR')

        try {
          // Run OCR on the image with local language files from resources/tessdata
          // Using extraResources instead of node_modules prevents permission issues on Windows
          const path = require('path')

          // Determine the correct path for language files
          // In production (packaged), they're in resources/tessdata (outside ASAR)
          // In development, they're in project root/tessdata
          const isDev = process.env.NODE_ENV === 'development'
          const tessdataPath = isDev
            ? path.join(__dirname, '../../tessdata')
            : path.join(process.resourcesPath, 'tessdata')

          await logger.info('Tesseract configuration', {
            isDev,
            langPath: tessdataPath,
            cachePath: tessdataPath,
            __dirname,
            resourcesPath: process.resourcesPath
          })

          // Check if language file exists
          try {
            const langFileCheck = path.join(tessdataPath, 'por.traineddata.gz')
            await logger.debug('Checking for language file', { langFileCheck })
            const exists = await fs.access(langFileCheck).then(() => true).catch(() => false)
            await logger.info('Language file exists check', { langFileCheck, exists })
          } catch (checkErr) {
            await logger.warn('Could not verify language file existence', checkErr)
          }

          await logger.debug('Creating Tesseract worker...')
          const worker = await Tesseract.createWorker('por', 1, {
            langPath: tessdataPath,
            cachePath: tessdataPath,
            gzip: true,
            logger: async (m: any) => {
              if (m.status === 'recognizing text') {
                await logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`)
              } else if (m.status) {
                await logger.debug(`OCR status: ${m.status}`, m)
              }
            }
          })

          await logger.info('Tesseract worker created successfully')

          // Set parameters for better accuracy
          await logger.debug('Setting OCR parameters')
          await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,  // Auto page segmentation
            preserve_interword_spaces: '1'
          })

          await logger.info('OCR parameters set, starting text recognition')

          const { data: { text: ocrText } } = await worker.recognize(firstPage)

          await logger.info('OCR recognition complete', { textLength: ocrText.length })

          await worker.terminate()
          await logger.debug('Tesseract worker terminated')

          text = ocrText
          await logger.info('OCR completed successfully', {
            characters: text.length,
            preview: text.substring(0, 200)
          })
        } catch (tesseractError: any) {
          await logger.error('Tesseract OCR error', {
            message: tesseractError.message,
            stack: tesseractError.stack,
            name: tesseractError.name,
            code: tesseractError.code
          })
          throw new Error(`OCR failed: ${tesseractError.message || 'Unknown error during text recognition'}`)
        }
      } catch (ocrError: any) {
        await logger.error('OCR process failed', {
          message: ocrError.message,
          stack: ocrError.stack,
          name: ocrError.name
        })
        // Pass through our custom error messages
        if (ocrError.message && ocrError.message.includes('elementos gráficos não suportados')) {
          throw ocrError
        }
        throw new Error('Não foi possível extrair texto do PDF (OCR falhou)')
      }
    }

    // DEBUG: Log extracted text to console
    console.log('===== EXTRACTED TEXT (FINAL) =====')
    console.log(text)
    console.log('===== END TEXT =====')

    // Extract document number (appears as "8067 1478311" or similar)
    const documentNumberMatch = text.match(/NÚMERO DO DOCUMENTO[\s\S]*?(\d+\s+\d+)/i) ||
                                text.match(/Documento\s+n[ºo°]?\s*:?\s*(\d+)/i)
    const documentNumber = documentNumberMatch ? documentNumberMatch[1].trim() : ''

    // Extract NIF (9-digit number, may appear under "NÚMERO DE IDENTIFICAÇÃO FISCAL")
    const nifMatch = text.match(/NÚMERO DE IDENTIFICAÇÃO FISCAL[\s\S]*?(\d{9})/i) ||
                     text.match(/NIF\s*:?\s*(\d{9})/i) ||
                     text.match(/\b(\d{9})\b/)
    const nif = nifMatch ? nifMatch[1] : ''

    // Extract taxpayer name (appears under "NOME" header or after NIF)
    const taxpayerMatch = text.match(/NOME[\s\S]*?([A-ZÀ-Ú][A-ZÀ-Ú\s,.-]+(?:LDA|SA|UNIPESSOAL)?)/i) ||
                         text.match(/Nome\s*:?\s*([A-ZÀ-Ú\s,.-]+?)(?=\s*NIF|$)/i)
    const taxpayerName = taxpayerMatch ? taxpayerMatch[1].trim() : ''

    // Extract payment reference (15-digit number with dots like 156.080.671.478.311)
    const referenceMatch = text.match(/(\d{3}[.\s]\d{3}[.\s]\d{3}[.\s]\d{3}[.\s]\d{3})/i)
    let paymentReference = ''
    if (referenceMatch) {
      paymentReference = referenceMatch[1].replace(/[\s.]/g, '').trim()
    }

    // Extract entity
    const entity = paymentReference.substring(0, 3)

    // DEBUG: Log extracted values
    console.log('===== EXTRACTED VALUES =====')
    console.log('Document Number:', documentNumber)
    console.log('NIF:', nif)
    console.log('Taxpayer Name:', taxpayerName)
    console.log('Payment Reference:', paymentReference)
    console.log('Entity:', entity)

    // Extract amount (appears as "€ 110,40" or "VALOR A PAGAR 110,40")
    const amountMatch = text.match(/VALOR A PAGAR\s+([\d.,]+)/i) ||
                        text.match(/Importância a pagar[\s\S]*?€\s*([\d.,]+)/i) ||
                        text.match(/€\s*([\d.,]+)/i) ||
                        text.match(/Total\s*:?\s*€?\s*([\d.,]+)/i)
    let amount = 0
    if (amountMatch) {
      const amountStr = amountMatch[1].replace(/\./g, '').replace(',', '.')
      amount = parseFloat(amountStr)
    }

    console.log('Amount:', amount)

    // Extract due date
    const dueDateMatch = text.match(/Data\s+limite\s+de\s+pagamento\s*:?\s*(\d{4}[-\/]\d{2}[-\/]\d{2})/i) ||
                         text.match(/Data\s+limite\s*:?\s*(\d{4}[-\/]\d{2}[-\/]\d{2})/i)
    const dueDate = dueDateMatch ? dueDateMatch[1] : ''

    // Extract tax code
    const taxCodeMatch = text.match(/C[óo]digo\s+do\s+imposto\s*:?\s*(\d{3})/i)
    const taxCode = taxCodeMatch ? taxCodeMatch[1] : ''

    // Extract period
    const periodMatch = text.match(/Per[íi]odo\s*:?\s*(\d{4}\s*[\/\-]\s*\w+)/i)
    const period = periodMatch ? periodMatch[1].trim() : ''

    // Validate essential data
    if (!paymentReference || !amount || !nif) {
      throw new Error('Não foi possível extrair dados essenciais do PDF. Verifique se o formato está correto.')
    }

    return {
      success: true,
      data: {
        documentNumber,
        nif,
        taxpayerName,
        paymentReference,
        entity,
        amount,
        dueDate,
        taxCode,
        period
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao processar PDF'
    }
  }
})

ipcMain.handle('generate-and-save-sepa', async (_event, payments: PaymentData[], defaultFileName: string, format: ExportFormat = 'SEPA') => {
  try {
    let content: string
    let fileExtension: string
    let fileTypeName: string

    if (format === 'PS2') {
      // Generate PS2 format
      content = generatePS2(payments)
      fileExtension = 'ps2'
      fileTypeName = 'PS2 Files'
    } else {
      // Generate SEPA XML format
      content = generateSepaXml(payments)
      fileExtension = 'xml'
      fileTypeName = 'XML Files'
    }

    // Show save dialog with appropriate extension
    const result = await dialog.showSaveDialog({
      defaultPath: defaultFileName.replace(/\.\w+$/, `.${fileExtension}`),
      filters: [
        { name: fileTypeName, extensions: [fileExtension] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false }
    }

    // Save the file
    await fs.writeFile(result.filePath, content, 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : `Erro ao gerar ficheiro ${format}`
    }
  }
})
