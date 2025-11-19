import { PaymentData } from '../shared/types'

interface PS2Config {
  debtorName?: string
  debtorNIF?: string
  executionDate?: Date
}

/**
 * Generates PS2 format file for Portuguese bank payments
 * PS2 is a standard format used by Portuguese banks for batch payments to government entities
 *
 * Format specification (80-byte fixed-length records):
 * - PS21 (Header): Entity info, date, currency, transaction count
 * - PS22 (Detail): Operation type 470 + amount (40 digits) + reference (26 digits: NIF+Ref+00)
 * - PS29 (Footer): Transaction count and total amount
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

  // Convert amount to cents and pad to 40 digits (PS2 standard)
  const formatAmount = (amount: number): string => {
    const cents = Math.round(amount * 100)
    return String(cents).padStart(40, '0')
  }

  // Format payment reference (15 digits, padded with trailing zeros)
  const formatReference = (reference: string): string => {
    // Remove any spaces or special characters
    const cleanRef = reference.replace(/[\s.-]/g, '')
    // Ensure exactly 15 digits, pad with trailing zeros if needed
    return cleanRef.substring(0, 15).padEnd(15, '0')
  }

  // Format NIF (9 digits)
  const formatNIF = (nif: string): string => {
    const cleanNIF = nif.replace(/\D/g, '')
    return cleanNIF.padStart(9, '0').substring(0, 9)
  }

  // Format combined reference: NIF (9) + Payment Reference (15) + "00" (2) = 26 digits
  const formatCombinedReference = (nif: string, reference: string): string => {
    return formatNIF(nif) + formatReference(reference) + '00'
  }

  const lines: string[] = []

  // PS21 - Header Record (80 bytes)
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0)
  const totalCents = Math.round(totalAmount * 100)
  const numberOfTransactions = payments.length

  // Header format (80 bytes total):
  // PS21 (4) + entity (3: 247) + zeros (27) + txn count (5) + date (8) + EUR (3) + exec date (8) + spaces (6) + zeros (16)
  const header = [
    'PS21',                                           // 4 bytes - Record type
    '247',                                            // 3 bytes - Entity code for tax payments
    '0'.repeat(27),                                   // 27 bytes - Zeros
    String(numberOfTransactions).padStart(5, '0'),    // 5 bytes - Number of transactions
    formatDate(now),                                  // 8 bytes - Creation date (YYYYMMDD)
    'EUR',                                            // 3 bytes - Currency
    formatDate(executionDate),                        // 8 bytes - Execution date (YYYYMMDD)
    ' '.repeat(6),                                    // 6 bytes - Spaces
    '0'.repeat(16)                                    // 16 bytes - Zeros
  ].join('')

  lines.push(header)

  // PS22 - Detail Records (one per payment, 80 bytes each)
  payments.forEach((payment) => {
    // Detail format (80 bytes total):
    // PS22 (4) + operation type (3: 470) + amount (40) + spaces (7) + reference (26: NIF+Ref+00)
    const detail = [
      'PS22',                                                    // 4 bytes - Record type
      '470',                                                     // 3 bytes - Operation type for government payments
      formatAmount(payment.amount),                              // 40 bytes - Amount in cents
      ' '.repeat(7),                                             // 7 bytes - Spaces
      formatCombinedReference(payment.nif, payment.paymentReference)  // 26 bytes - NIF + Reference + 00
    ].join('')

    lines.push(detail)
  })

  // PS29 - Footer Record (80 bytes)
  // Footer format (80 bytes total):
  // PS29 (4) + entity (3: 247) + zeros (27) + txn count (8) + total cents (17) + zeros (21)
  const footer = [
    'PS29',                                           // 4 bytes - Record type
    '247',                                            // 3 bytes - Entity code
    '0'.repeat(27),                                   // 27 bytes - Zeros
    String(numberOfTransactions).padStart(8, '0'),    // 8 bytes - Number of transactions
    String(totalCents).padStart(17, '0'),             // 17 bytes - Total amount in cents
    '0'.repeat(21)                                    // 21 bytes - Zeros
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