import { PaymentData } from '../shared/types'
import { js2xml } from 'xml-js'

interface SepaConfig {
  debtorName: string
  debtorIBAN: string
  debtorBIC?: string
}

// Default configuration - can be made configurable later
const defaultConfig: SepaConfig = {
  debtorName: 'EMPRESA EXEMPLO LDA',
  debtorIBAN: 'PT50000000000000000000000', // Placeholder - should be configured by user
  debtorBIC: 'BBPIPTPLXXX' // Placeholder - should be configured by user
}

export function generateSepaXml(payments: PaymentData[], config: SepaConfig = defaultConfig): string {
  const now = new Date()
  const msgId = `MSG-${now.getTime()}`
  const pmtInfId = `PMT-${now.getTime()}`
  const creationDateTime = now.toISOString()

  // Calculate control sum (total amount)
  const controlSum = payments.reduce((sum, p) => sum + p.amount, 0)
  const numberOfTransactions = payments.length

  // Build payment information entries
  const creditTransferTransactionInformation = payments.map((payment, index) => ({
    CdtTrfTxInf: {
      PmtId: {
        InstrId: `TXN-${index + 1}`,
        EndToEndId: payment.paymentReference || `E2E-${index + 1}`
      },
      Amt: {
        InstdAmt: {
          _attributes: {
            Ccy: 'EUR'
          },
          _text: payment.amount.toFixed(2)
        }
      },
      CdtrAgt: {
        FinInstnId: {
          BIC: 'BBPIPTPLXXX' // Banco de Portugal BIC for tax payments
        }
      },
      Cdtr: {
        Nm: 'AUTORIDADE TRIBUTARIA E ADUANEIRA'
      },
      CdtrAcct: {
        Id: {
          IBAN: 'PT50003506514963985101172' // AT IBAN for tax payments (example)
        }
      },
      RmtInf: {
        Strd: {
          CdtrRefInf: {
            Tp: {
              CdOrPrtry: {
                Cd: 'SCOR'
              },
              Issr: 'PT:AT'
            },
            Ref: payment.paymentReference
          },
          AddtlRmtInf: [
            `NIF: ${payment.nif}`,
            `Entidade: ${payment.entity}`,
            `Documento: ${payment.documentNumber}`,
            payment.period ? `Periodo: ${payment.period}` : null
          ].filter(Boolean).join(' | ')
        }
      }
    }
  }))

  const document = {
    _declaration: {
      _attributes: {
        version: '1.0',
        encoding: 'UTF-8'
      }
    },
    Document: {
      _attributes: {
        xmlns: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
      },
      CstmrCdtTrfInitn: {
        GrpHdr: {
          MsgId: msgId,
          CreDtTm: creationDateTime,
          NbOfTxs: numberOfTransactions.toString(),
          CtrlSum: controlSum.toFixed(2),
          InitgPty: {
            Nm: config.debtorName
          }
        },
        PmtInf: {
          PmtInfId: pmtInfId,
          PmtMtd: 'TRF',
          BtchBookg: 'true',
          NbOfTxs: numberOfTransactions.toString(),
          CtrlSum: controlSum.toFixed(2),
          PmtTpInf: {
            SvcLvl: {
              Cd: 'SEPA'
            }
          },
          ReqdExctnDt: now.toISOString().split('T')[0],
          Dbtr: {
            Nm: config.debtorName
          },
          DbtrAcct: {
            Id: {
              IBAN: config.debtorIBAN
            }
          },
          DbtrAgt: {
            FinInstnId: {
              BIC: config.debtorBIC
            }
          },
          ChrgBr: 'SLEV',
          CdtTrfTxInf: creditTransferTransactionInformation
        }
      }
    }
  }

  const xml = js2xml(document, {
    compact: true,
    spaces: 2,
    indentAttributes: false
  })

  return xml
}

export function validateSepaConfig(config: Partial<SepaConfig>): string[] {
  const errors: string[] = []

  if (!config.debtorName || config.debtorName.trim().length === 0) {
    errors.push('Nome do devedor é obrigatório')
  }

  if (!config.debtorIBAN || !isValidIBAN(config.debtorIBAN)) {
    errors.push('IBAN do devedor inválido')
  }

  return errors
}

function isValidIBAN(iban: string): boolean {
  // Remove spaces and convert to uppercase
  const cleanIBAN = iban.replace(/\s/g, '').toUpperCase()

  // Check length (Portuguese IBAN should be 25 characters)
  if (!/^PT\d{23}$/.test(cleanIBAN)) {
    return false
  }

  return true
}
