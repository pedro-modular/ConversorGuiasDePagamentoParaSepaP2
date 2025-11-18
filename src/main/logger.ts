/**
 * Debug logger for troubleshooting Windows OCR issues
 * Writes detailed logs to a file in the app's user data directory
 */

import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

class Logger {
  private logFilePath: string
  private logBuffer: string[] = []
  private isInitialized = false

  constructor() {
    // Log file will be in:
    // Windows: C:\Users\<user>\AppData\Roaming\guiasdepagamentosepa\debug.log
    // macOS: ~/Library/Application Support/guiasdepagamentosepa/debug.log
    this.logFilePath = join(app.getPath('userData'), 'debug.log')
  }

  async init() {
    if (this.isInitialized) return

    try {
      // Create log header with system info
      const header = [
        '='.repeat(80),
        `Debug Log - Guias de Pagamento SEPA v${app.getVersion()}`,
        `Started: ${new Date().toISOString()}`,
        `Platform: ${process.platform} (${process.arch})`,
        `Node: ${process.version}`,
        `Electron: ${process.versions.electron}`,
        `App Path: ${app.getAppPath()}`,
        `User Data: ${app.getPath('userData')}`,
        `Resources Path: ${process.resourcesPath}`,
        '='.repeat(80),
        ''
      ].join('\n')

      await fs.writeFile(this.logFilePath, header, 'utf-8')
      this.isInitialized = true

      this.log('INFO', 'Logger initialized successfully')
      this.log('INFO', `Log file: ${this.logFilePath}`)
    } catch (error) {
      console.error('Failed to initialize logger:', error)
    }
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    let formattedMsg = `[${timestamp}] [${level.padEnd(5)}] ${message}`

    if (data !== undefined) {
      if (data instanceof Error) {
        formattedMsg += `\n  Error: ${data.message}`
        if (data.stack) {
          formattedMsg += `\n  Stack: ${data.stack}`
        }
      } else if (typeof data === 'object') {
        formattedMsg += `\n  Data: ${JSON.stringify(data, null, 2)}`
      } else {
        formattedMsg += `\n  Data: ${data}`
      }
    }

    return formattedMsg
  }

  async log(level: string, message: string, data?: any) {
    if (!this.isInitialized) {
      await this.init()
    }

    const formattedMsg = this.formatMessage(level, message, data)

    // Also log to console
    console.log(formattedMsg)

    try {
      await fs.appendFile(this.logFilePath, formattedMsg + '\n', 'utf-8')
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  async info(message: string, data?: any) {
    await this.log('INFO', message, data)
  }

  async warn(message: string, data?: any) {
    await this.log('WARN', message, data)
  }

  async error(message: string, data?: any) {
    await this.log('ERROR', message, data)
  }

  async debug(message: string, data?: any) {
    await this.log('DEBUG', message, data)
  }

  async section(title: string) {
    const separator = '-'.repeat(80)
    await this.log('INFO', `\n${separator}\n${title}\n${separator}`)
  }

  getLogPath(): string {
    return this.logFilePath
  }
}

// Export singleton instance
export const logger = new Logger()
