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
          // Log full OCR text for debugging
          await logger.debug('Full OCR text', {
            fullText: text
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

    // Log extraction start
    await logger.info('Starting data extraction from text', { totalCharacters: text.length })

    // Extract document number (appears as "8067 1478311" or similar)
    const documentNumberMatch = text.match(/NÚMERO DO DOCUMENTO[\s\S]*?(\d+\s+\d+)/i) ||
                                text.match(/Documento\s+n[ºo°]?\s*:?\s*(\d+)/i)
    const documentNumber = documentNumberMatch ? documentNumberMatch[1].trim() : ''
    await logger.info('Extraction: Document number', {
      found: !!documentNumberMatch,
      value: documentNumber || '(não encontrado)'
    })

    // Extract NIF (9-digit number, may appear under "NÚMERO DE IDENTIFICAÇÃO FISCAL")
    // The NIF is exactly 9 digits - must not be part of a longer number
    const nifPattern1 = text.match(/NÚMERO DE IDENTIFICAÇÃO FISCAL[\s\S]*?\b(\d{9})\b(?!\d)/i)
    const nifPattern2 = text.match(/NIF\s*:?\s*(\d{9})\b/i)
    // Find all 9-digit numbers that are not part of longer numbers
    const allNineDigitNumbers = text.match(/\b(\d{9})\b(?!\d)/g)
    // Filter to get only standalone 9-digit numbers (not part of 10+ digit numbers)
    let nif = ''
    if (nifPattern1) {
      nif = nifPattern1[1]
    } else if (nifPattern2) {
      nif = nifPattern2[1]
    } else if (allNineDigitNumbers) {
      // Find a 9-digit number that's not just the first 9 of a longer number
      // by checking if it appears as a standalone number in the text
      for (const num of allNineDigitNumbers) {
        // Check if this is truly a standalone 9-digit number
        const standalonePattern = new RegExp(`\\b${num}\\b(?!\\d)`)
        if (standalonePattern.test(text)) {
          nif = num
          break
        }
      }
    }
    const nifMatch = nif ? true : false
    await logger.info('Extraction: NIF', {
      found: nifMatch,
      value: nif || '(não encontrado)',
      patternUsed: nifPattern1 ? 'NÚMERO DE IDENTIFICAÇÃO FISCAL' : nifPattern2 ? 'NIF:' : allNineDigitNumbers ? 'standalone 9-digit' : 'none'
    })

    // Extract taxpayer name (appears under "NOME" header or after NIF)
    // Look for company names ending with LDA, SA, UNIPESSOAL, etc.
    // Must start with uppercase and be mostly uppercase (company names)
    const taxpayerMatch = text.match(/\b([A-ZÀ-Ú][A-ZÀ-Ú\s,.-]+(?:LDA|LIMITADA|SA|UNIPESSOAL|S\.A\.))\b/) ||
                         text.match(/NOME\s*\n+\s*([A-ZÀ-Ú][A-ZÀ-Ú\s,.-]+)/i) ||
                         text.match(/Nome\s*:?\s*([A-ZÀ-Ú\s,.-]+?)(?=\s*NIF|$)/i)
    const taxpayerName = taxpayerMatch ? taxpayerMatch[1].trim() : ''
    await logger.info('Extraction: Taxpayer name', {
      found: !!taxpayerMatch,
      value: taxpayerName || '(não encontrado)'
    })

    // Extract payment reference (15-digit number with dots like 156.280.671.432.788)
    // Primary pattern: with separators (dots or spaces) - strict format
    const referenceMatch = text.match(/(\d{3}[.\s]\d{3}[.\s]\d{3}[.\s]\d{3}[.\s]\d{3})/i)
    // Fallback pattern: 15 consecutive digits without separators
    const referenceMatch2 = text.match(/\b(\d{15})\b/)
    // Fallback pattern: Look for "Referência para pagamento" followed by digits with any separators
    // This handles OCR errors where dots become spaces or digits get split
    const referenceMatch3 = text.match(/Refer[êe]ncia\s+para\s+pagamento[\s\S]*?([\d\s.]{15,25})/i)
    // Fallback pattern: Look for any sequence that looks like a reference (digits with dots/spaces, 15+ chars)
    const referenceMatch4 = text.match(/(\d{2,3}[.\s]\d{2,3}[.\s]\d{2,3}[.\s]\d{2,3}[.\s]\d{2,3})/i)

    let paymentReference = ''
    if (referenceMatch) {
      paymentReference = referenceMatch[1].replace(/[\s.]/g, '').trim()
    } else if (referenceMatch2) {
      paymentReference = referenceMatch2[1]
    } else if (referenceMatch3) {
      // Clean and extract only digits
      paymentReference = referenceMatch3[1].replace(/[^\d]/g, '').trim()
    } else if (referenceMatch4) {
      paymentReference = referenceMatch4[1].replace(/[\s.]/g, '').trim()
    }

    // Ensure we have exactly 15 digits
    if (paymentReference && paymentReference.length !== 15) {
      paymentReference = ''  // Invalid reference, clear it
    }
    await logger.info('Extraction: Payment reference', {
      found: !!(referenceMatch || referenceMatch2 || referenceMatch3 || referenceMatch4),
      rawMatch: referenceMatch ? referenceMatch[1] : referenceMatch2 ? referenceMatch2[1] : referenceMatch3 ? referenceMatch3[1] : referenceMatch4 ? referenceMatch4[1] : '(não encontrado)',
      cleanedValue: paymentReference || '(não encontrado)',
      expectedFormat: 'XXX.XXX.XXX.XXX.XXX',
      patternUsed: referenceMatch ? 'with separators' : referenceMatch2 ? '15 consecutive digits' : referenceMatch3 ? 'Referência para pagamento' : referenceMatch4 ? 'Referência label' : 'none'
    })

    // Extract entity
    const entity = paymentReference.substring(0, 3)

    // Extract amount (appears as "€ 110,40" or "VALOR A PAGAR 110,40")
    const amountPattern1 = text.match(/VALOR A PAGAR\s+([\d.,]+)/i)
    const amountPattern2 = text.match(/Importância a pagar[\s\S]*?€\s*([\d.,]+)/i)
    const amountPattern3 = text.match(/€\s*([\d.,]+)/i)
    const amountPattern4 = text.match(/Total\s*:?\s*€?\s*([\d.,]+)/i)
    const amountMatch = amountPattern1 || amountPattern2 || amountPattern3 || amountPattern4
    let amount = 0
    if (amountMatch) {
      const amountStr = amountMatch[1].replace(/\./g, '').replace(',', '.')
      amount = parseFloat(amountStr)
    }
    await logger.info('Extraction: Amount', {
      found: !!amountMatch,
      rawMatch: amountMatch ? amountMatch[1] : '(não encontrado)',
      parsedValue: amount,
      patternUsed: amountPattern1 ? 'VALOR A PAGAR' : amountPattern2 ? 'Importância €' : amountPattern3 ? '€' : amountPattern4 ? 'Total' : 'none'
    })

    // Extract due date
    const dueDateMatch = text.match(/Data\s+limite\s+de\s+pagamento\s*:?\s*(\d{4}[-\/]\d{2}[-\/]\d{2})/i) ||
                         text.match(/Data\s+limite\s*:?\s*(\d{4}[-\/]\d{2}[-\/]\d{2})/i)
    const dueDate = dueDateMatch ? dueDateMatch[1] : ''
    await logger.info('Extraction: Due date', {
      found: !!dueDateMatch,
      value: dueDate || '(não encontrado)'
    })

    // Extract tax code
    const taxCodeMatch = text.match(/C[óo]digo\s+do\s+imposto\s*:?\s*(\d{3})/i)
    const taxCode = taxCodeMatch ? taxCodeMatch[1] : ''

    // Extract period
    const periodMatch = text.match(/Per[íi]odo\s*:?\s*(\d{4}\s*[\/\-]\s*\w+)/i)
    const period = periodMatch ? periodMatch[1].trim() : ''

    // Check for missing essential fields
    const missingFields: string[] = []
    if (!paymentReference) missingFields.push('Referência de pagamento')
    if (!amount) missingFields.push('Valor a pagar')
    if (!nif) missingFields.push('NIF')

    // Log extraction summary
    await logger.info('Extraction summary', {
      documentNumber: documentNumber || '(não encontrado)',
      nif: nif || '(não encontrado)',
      taxpayerName: taxpayerName || '(não encontrado)',
      paymentReference: paymentReference || '(não encontrado)',
      entity: entity || '(não encontrado)',
      amount: amount || 0,
      dueDate: dueDate || '(não encontrado)',
      missingFields: missingFields.length > 0 ? missingFields : 'none'
    })

    // If essential fields are missing, return partial data for manual review
    if (missingFields.length > 0) {
      await logger.warn('Essential fields missing - needs manual review', { missingFields })
      return {
        success: false,
        needsReview: true,
        missingFields,
        extractedText: text,
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
        },
        error: `Campos em falta: ${missingFields.join(', ')}`
      }
    }

    await logger.info('All essential data extracted successfully')

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
      fileExtension = 'txt'
      fileTypeName = 'Text Files'
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
