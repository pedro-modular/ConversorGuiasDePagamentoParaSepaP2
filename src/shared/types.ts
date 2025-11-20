export interface PaymentData {
  fileName: string
  documentNumber: string
  nif: string
  taxpayerName: string
  paymentReference: string
  entity: string
  amount: number
  dueDate: string
  taxCode: string
  period: string
  status: 'pending' | 'processing' | 'success' | 'error' | 'needs_review'
  error?: string
  extractedText?: string  // Raw OCR text for manual review
}

export interface ParsedPaymentData {
  documentNumber: string
  nif: string
  taxpayerName: string
  paymentReference: string
  entity: string
  amount: number
  dueDate: string
  taxCode: string
  period: string
}

export interface ParseResult {
  success: boolean
  data?: ParsedPaymentData
  error?: string
  needsReview?: boolean
  missingFields?: string[]
  extractedText?: string
}

export type ExportFormat = 'SEPA' | 'PS2'

export interface PS2Config {
  debtorNIB: string
  executionDate: string
}

export interface ElectronAPI {
  selectPdfFiles: () => Promise<string[]>
  parsePdfFile: (filePath: string) => Promise<ParseResult>
  generateAndSaveSepa: (
    payments: PaymentData[],
    defaultFileName: string,
    format?: ExportFormat,
    ps2Config?: PS2Config
  ) => Promise<{ success: boolean; filePath?: string; error?: string }>
  getAppVersion: () => Promise<string>
  openLogFile: () => Promise<{ success: boolean; path: string }>
  getLogPath: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
