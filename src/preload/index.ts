import { contextBridge, ipcRenderer } from 'electron'
import { ExportFormat, PS2Config } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  selectPdfFiles: () => ipcRenderer.invoke('select-pdf-files'),
  parsePdfFile: (filePath: string) => ipcRenderer.invoke('parse-pdf-file', filePath),
  generateAndSaveSepa: (
    payments: any[],
    defaultFileName: string,
    format?: ExportFormat,
    ps2Config?: PS2Config
  ) => ipcRenderer.invoke('generate-and-save-sepa', payments, defaultFileName, format, ps2Config),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  openLogFile: () => ipcRenderer.invoke('open-log-file')
})
