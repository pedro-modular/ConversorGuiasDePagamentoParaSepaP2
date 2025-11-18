import { PaymentData } from '../shared/types'

interface PS2Config {
  debtorName?: string
  debtorNIF?: string
  executionDate?: Date
}

/**
 * Generates PS2 format file for Portuguese bank payments
 * PS2 is a standard format used by Portuguese banks for batch payments to government entities
 */
export function generatePS2(payments: PaymentData[], config: PS2Config = {}): string {
  const now = new Date()
  const executionDate = config.executionDate || now

  // Format date as YYYYMMDD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
  }

  // Convert amount to cents and pad to 12 digits
  const formatAmount = (amount: number): string => {
    const cents = Math.round(amount * 100)
    return String(cents).padStart(12, '0')
  }

  // Format payment reference (15 digits)
  const formatReference = (reference: string): string => {
    // Remove any spaces or special characters
    const cleanRef = reference.replace(/[\s.-]/g, '')
    return cleanRef.padEnd(15, '0')
  }

  // Format NIF (9 digits)
  const formatNIF = (nif: string): string => {
    const cleanNIF = nif.replace(/\D/g, '')
    return cleanNIF.padStart(9, '0').substring(0, 9)
  }

  const lines: string[] = []

  // PS21 - Header Record
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0)
  const totalCents = Math.round(totalAmount * 100)
  const numberOfTransactions = payments.length

  // Header format:
  // PS21 + entity (47) + zeros (34) + transaction count (5) + date (8) + EUR + execution date (8) + zeros (36)
  const header = [
    'PS21',
    '47',  // Entity code for tax payments
    '0'.repeat(34),  // Zeros
    String(numberOfTransactions).padStart(5, '0'),
    formatDate(now),
    'EUR',
    formatDate(executionDate),
    ' '.repeat(20),  // Spaces
    '0'.repeat(16)   // Zeros
  ].join('')

  lines.push(header)

  // PS22 - Detail Records (one per payment)
  payments.forEach((payment) => {
    // Detail format:
    // PS22 + entity (47) + zeros (38) + amount in cents (12) + spaces (11) + NIF (9) + reference (15) + zeros
    const detail = [
      'PS22',
      '47',  // Entity code
      '0'.repeat(38),  // Zeros
      formatAmount(payment.amount),  // Amount in cents
      ' '.repeat(11),  // Spaces
      formatNIF(payment.nif),  // NIF
      formatReference(payment.paymentReference)  // Payment reference
    ].join('')

    lines.push(detail)
  })

  // PS29 - Footer Record
  // Footer format:
  // PS29 + entity (47) + zeros (38) + transaction count (8) + total amount (17) + zeros (70)
  const footer = [
    'PS29',
    '47',  // Entity code
    '0'.repeat(38),  // Zeros
    String(numberOfTransactions).padStart(8, '0'),
    String(totalCents).padStart(17, '0'),  // Total amount in cents
    '0'.repeat(70)  // Zeros
  ].join('')

  lines.push(footer)

  // Join all lines with line breaks
  return lines.join('\n')
}

/**
 * Validates if the PS2 data is correct
 */
export function validatePS2Data(payments: PaymentData[]): string[] {
  const errors: string[] = []

  if (payments.length === 0) {
    errors.push('Sem pagamentos para processar')
  }

  payments.forEach((payment, index) => {
    if (!payment.nif || payment.nif.length !== 9) {
      errors.push(`Pagamento ${index + 1}: NIF inválido`)
    }

    if (!payment.paymentReference) {
      errors.push(`Pagamento ${index + 1}: Referência de pagamento em falta`)
    }

    if (payment.amount <= 0) {
      errors.push(`Pagamento ${index + 1}: Montante inválido`)
    }

    // Validate entity code (should be 3 digits)
    if (!payment.entity || payment.entity.length !== 3) {
      errors.push(`Pagamento ${index + 1}: Código de entidade inválido`)
    }
  })

  return errors
}