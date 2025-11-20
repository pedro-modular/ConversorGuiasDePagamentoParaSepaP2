import { PaymentData } from '../shared/types'

interface PS2Config {
  debtorName?: string
  debtorNIF?: string
  debtorNIB?: string  // Portuguese bank account number (21 digits)
  executionDate?: Date
}

/**
 * Generates PS2 format file for Portuguese bank payments
 * PS2 is a standard format used by Portuguese banks for batch payments
 *
 * Official specification: https://bpinetempresas.bancobpi.pt/Ajuda/Formato_FichPS2.htm
 *
 * Format specification (80-byte fixed-length records):
 * - PS21 (Header): PS2 + type(1) + op_code + status + NIB(21) + EUR + date + ordering_ref(20) + filler(19)
 * - PS22 (Detail): PS2 + type(2) + op_code + status + dest_NIB(21) + amount(13) + ordering_ref(20) + transfer_ref(15) + filler(2)
 * - PS29 (Footer): PS2 + type(9) + op_code + status + zeros(6) + count(14) + total_amount(13) + zeros(38)
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

  // Format NIB (Portuguese bank account - 21 digits)
  const formatNIB = (nib: string | undefined): string => {
    if (!nib) {
      // Default/placeholder NIB if not provided
      return '000000000000000000000'
    }
    // Remove any spaces or special characters
    const cleanNIB = nib.replace(/\s/g, '')
    // Take last 21 characters (in case input has extra leading zeros)
    if (cleanNIB.length > 21) {
      return cleanNIB.substring(cleanNIB.length - 21)
    }
    // Pad to 21 if shorter
    return cleanNIB.padStart(21, '0')
  }

  // Convert amount to cents and pad to 13 digits (positions 31-43 in detail record)
  const formatAmount = (amount: number): string => {
    const cents = Math.round(amount * 100)
    return String(cents).padStart(13, '0')
  }

  // Format ordering reference field (20 chars) - contains NIF right-aligned with spaces
  const formatOrderingReference = (nif: string): string => {
    const cleanNIF = nif.replace(/\D/g, '').substring(0, 9)
    return cleanNIF.padStart(20, ' ')
  }

  // Format transfer reference (15 chars) - payment reference number + suffix
  const formatTransferReference = (reference: string): string => {
    const cleanRef = reference.replace(/[\s.-]/g, '')
    // Take first 14 digits and add '3' suffix for total of 15 chars
    const ref14 = cleanRef.substring(0, 14).padStart(14, '0')
    return ref14 + '3'
  }

  const lines: string[] = []

  // PS21 - Header Record (80 bytes)
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0)
  const totalCents = Math.round(totalAmount * 100)
  const numberOfTransactions = payments.length

  // Header format per official spec (80 bytes total):
  // Pos 1-3: "PS2" | Pos 4: "1" | Pos 5-6: op_code | Pos 7-8: account_status | Pos 9: record_status
  // Pos 10-30: NIB (21) | Pos 31-33: "EUR" | Pos 34-41: date | Pos 42-61: ordering_ref (20) | Pos 62-80: filler (19)
  const header = [
    'PS2',                                            // Positions 1-3
    '1',                                              // Position 4 - Record type
    '47',                                             // Positions 5-6 - Operation code (47 = tax payments)
    '00',                                             // Positions 7-8 - Account status
    '0',                                              // Position 9 - Record status
    formatNIB(config.debtorNIB),                      // Positions 10-30 - Ordering account NIB (21 chars)
    'EUR',                                            // Positions 31-33 - Currency
    formatDate(executionDate),                        // Positions 34-41 - Processing date (YYYYMMDD)
    ' '.repeat(20),                                   // Positions 42-61 - Ordering reference (20 spaces)
    '0'.repeat(19)                                    // Positions 62-80 - Filler (19 zeros)
  ].join('')

  lines.push(header)

  // PS22 - Detail Records (one per payment, 80 bytes each)
  payments.forEach((payment) => {
    // Detail format per official spec (80 bytes total):
    // Pos 1-3: "PS2" | Pos 4: "2" | Pos 5-6: op_code | Pos 7-8: account_status | Pos 9: record_status
    // Pos 10-30: dest_NIB (21) | Pos 31-43: amount (13) | Pos 44-63: ordering_ref (20) | Pos 64-78: transfer_ref (15) | Pos 79-80: filler (2)
    const detail = [
      'PS2',                                                    // Positions 1-3
      '2',                                                      // Position 4 - Record type
      '47',                                                     // Positions 5-6 - Operation code (47 = tax payments)
      '00',                                                     // Positions 7-8 - Account status
      '0',                                                      // Position 9 - Record status
      '0'.repeat(21),                                           // Positions 10-30 - Destination NIB (zeros for tax entity)
      formatAmount(payment.amount),                             // Positions 31-43 - Amount in cents (13 chars)
      formatOrderingReference(payment.nif),                     // Positions 44-63 - Ordering reference with NIF (20 chars)
      formatTransferReference(payment.paymentReference),        // Positions 64-78 - Transfer reference (15 chars)
      '00'                                                      // Positions 79-80 - Filler
    ].join('')

    lines.push(detail)
  })

  // PS29 - Footer Record (80 bytes)
  // Footer format per official spec (80 bytes total):
  // Pos 1-3: "PS2" | Pos 4: "9" | Pos 5-6: op_code | Pos 7-8: filler | Pos 9: record_status
  // Pos 10-15: zeros (6) | Pos 16-29: count (14) | Pos 30-42: total_amount (13) | Pos 43-80: zeros (38)
  const footer = [
    'PS2',                                            // Positions 1-3
    '9',                                              // Position 4 - Record type
    '47',                                             // Positions 5-6 - Operation code
    '00',                                             // Positions 7-8 - Filler
    '0',                                              // Position 9 - Record status
    '0'.repeat(6),                                    // Positions 10-15 - Zeros (6 chars)
    String(numberOfTransactions).padStart(14, '0'),   // Positions 16-29 - Detail record count (14 chars)
    String(totalCents).padStart(13, '0'),             // Positions 30-42 - Total amount in cents (13 chars)
    '0'.repeat(38)                                    // Positions 43-80 - Zeros (38 chars)
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