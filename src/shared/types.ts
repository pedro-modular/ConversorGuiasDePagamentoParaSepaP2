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
  status: 'pending' | 'processing' | 'success' | 'error'
  error?: string
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

export type ExportFormat = 'SEPA' | 'PS2'

export interface ElectronAPI {
  selectPdfFiles: () => Promise<string[]>
  parsePdfFile: (filePath: string) => Promise<{ success: boolean; data?: ParsedPaymentData; error?: string }>
  generateAndSaveSepa: (payments: PaymentData[], defaultFileName: string, format?: ExportFormat) => Promise<{ success: boolean; filePath?: string; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
