// IMPORTANT: Load polyfills FIRST before any other imports
// This prevents "DOMMatrix is not defined" errors on Windows
import './polyfills'

import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { generateSepaXml } from './sepaGenerator'
import { generatePS2 } from './ps2Generator'
import { PaymentData, ExportFormat } from '../shared/types'

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

app.whenReady().then(() => {
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
  try {
    const buffer = await fs.readFile(filePath)
    let text = ''

    // Try text extraction first
    try {
      const data = await pdfParse(buffer)
      text = data.text || ''
      console.log('📄 Text extraction result:', text.length, 'characters')
    } catch (err) {
      console.log('⚠️  Text extraction failed:', err)
    }

    // If no text found or very little text, use OCR
    if (text.trim().length < 50) {
      console.log('🔍 No text found, using OCR...')

      try {
        console.log('🖼️  Converting PDF to image...')

        // Use dynamic import for pdfjs-dist ES module
        const pdfjsLib = await import('pdfjs-dist')
        const canvasModule = require('canvas')
        const { createCanvas } = canvasModule
        const path = require('path')

        // Configure worker for ES module build
        const workerPath = path.join(__dirname, '../../node_modules/pdfjs-dist/build/pdf.worker.mjs')
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath

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
        const firstPage = canvas.toBuffer('image/png')

        if (!firstPage) {
          throw new Error('Não foi possível converter PDF para imagem')
        }

        console.log('✅ PDF converted, running OCR...')

        try {
          // Run OCR on the image with local paths and better settings
          const worker = await Tesseract.createWorker('por', 1, {
            langPath: 'https://tessdata.projectnaptha.com/4.0.0',
            cachePath: app.getPath('userData'),
            logger: (m: any) => {
              if (m.status === 'recognizing text') {
                console.log(`OCR progress: ${Math.round(m.progress * 100)}%`)
              } else if (m.status) {
                console.log(`OCR status: ${m.status}`)
              }
            }
          })

          console.log('OCR worker created successfully')

          // Set parameters for better accuracy
          await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,  // Auto page segmentation
            preserve_interword_spaces: '1'
          })

          console.log('OCR parameters set, starting recognition...')

          const { data: { text: ocrText } } = await worker.recognize(firstPage)

          console.log('OCR recognition complete, terminating worker...')

          await worker.terminate()

          text = ocrText
          console.log('✅ OCR completed:', text.length, 'characters')
        } catch (tesseractError: any) {
          console.error('❌ Tesseract OCR error:', tesseractError)
          console.error('Stack trace:', tesseractError.stack)
          throw new Error(`OCR failed: ${tesseractError.message || 'Unknown error during text recognition'}`)
        }
      } catch (ocrError: any) {
        console.error('❌ OCR failed:', ocrError)
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
