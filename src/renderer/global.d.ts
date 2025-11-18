import { ExportFormat } from '../shared/types'

declare global {
  interface Window {
    electronAPI: {
      selectPdfFiles: () => Promise<string[]>
      parsePdfFile: (filePath: string) => Promise<any>
      generateAndSaveSepa: (
        payments: any[],
        defaultFileName: string,
        format?: ExportFormat
      ) => Promise<any>
      getAppVersion: () => Promise<string>
    }
  }
}

export {}
