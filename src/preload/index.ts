import { contextBridge, ipcRenderer } from 'electron'
import { ExportFormat } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  selectPdfFiles: () => ipcRenderer.invoke('select-pdf-files'),
  parsePdfFile: (filePath: string) => ipcRenderer.invoke('parse-pdf-file', filePath),
  generateAndSaveSepa: (payments: any[], defaultFileName: string, format?: ExportFormat) =>
    ipcRenderer.invoke('generate-and-save-sepa', payments, defaultFileName, format),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
})
