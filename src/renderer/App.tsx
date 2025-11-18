import React, { useState, useRef } from 'react'
import { PaymentData, ExportFormat } from '../shared/types'
import logo from './assets/patrocinio-logo-white.png'

const APP_VERSION = '1.0.1'

const App: React.FC = () => {
  const [files, setFiles] = useState<PaymentData[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (filePaths: string[]) => {
    const newFiles: PaymentData[] = filePaths.map(path => ({
      fileName: path.split('/').pop() || path.split('\\').pop() || path,
      documentNumber: '',
      nif: '',
      taxpayerName: '',
      paymentReference: '',
      entity: '',
      amount: 0,
      dueDate: '',
      taxCode: '',
      period: '',
      status: 'pending' as const
    }))

    setFiles(prev => [...prev, ...newFiles])

    // Process each file
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i]
      const fileIndex = files.length + i

      setFiles(prev => {
        const updated = [...prev]
        updated[fileIndex] = { ...updated[fileIndex], status: 'processing' }
        return updated
      })

      const result = await window.electronAPI.parsePdfFile(filePath)

      if (result.success && result.data) {
        setFiles(prev => {
          const updated = [...prev]
          updated[fileIndex] = {
            ...updated[fileIndex],
            ...result.data,
            status: 'success'
          }
          return updated
        })
      } else {
        setFiles(prev => {
          const updated = [...prev]
          updated[fileIndex] = {
            ...updated[fileIndex],
            status: 'error',
            error: result.error || 'Erro ao processar PDF'
          }
          return updated
        })
      }
    }
  }

  const handleSelectFiles = async () => {
    const filePaths = await window.electronAPI.selectPdfFiles()
    if (filePaths.length > 0) {
      await handleFileSelect(filePaths)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    const pdfFiles = droppedFiles.filter(file => file.name.toLowerCase().endsWith('.pdf'))

    if (pdfFiles.length > 0) {
      const filePaths = pdfFiles.map(file => (file as any).path)
      await handleFileSelect(filePaths)
    }
  }

  const handleGenerateFile = async (format: ExportFormat) => {
    const successfulFiles = files.filter(f => f.status === 'success')

    if (successfulFiles.length === 0) {
      alert(`Nenhum ficheiro processado com sucesso para gerar ${format}`)
      return
    }

    const filePrefix = format === 'PS2' ? 'PS2' : 'SEPA'
    const fileExtension = format === 'PS2' ? 'ps2' : 'xml'
    const defaultFileName = `${filePrefix}_${new Date().toISOString().split('T')[0]}.${fileExtension}`
    const result = await window.electronAPI.generateAndSaveSepa(successfulFiles, defaultFileName, format)

    if (result.success) {
      alert(`Ficheiro ${format} guardado com sucesso!\n${result.filePath}`)
    } else {
      alert(`Erro ao gerar ficheiro ${format}: ` + (result.error || 'Erro desconhecido'))
    }
  }

  const handleClearFiles = () => {
    setFiles([])
  }

  const successCount = files.filter(f => f.status === 'success').length
  const totalAmount = files
    .filter(f => f.status === 'success')
    .reduce((sum, f) => sum + f.amount, 0)

  return (
    <div className="app">
      <header className="header">
        <img src={logo} alt="Patrocínio Logo" className="logo" />
        <div className="header-content">
          <div className="header-info">
            <h1>Guias de Pagamento SEPA</h1>
            <span className="version">v{APP_VERSION}</span>
          </div>
          <p>Converta guias de pagamento PDF em ficheiros SEPA XML ou PS2</p>
        </div>
        <a href="https://patrocinio.pt" target="_blank" rel="noopener noreferrer" className="company-link">
          patrocinio.pt
        </a>
      </header>

      <div className="content">
        <div
          className={`upload-section ${isDragging ? 'dragover' : ''}`}
          onClick={handleSelectFiles}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="upload-icon">📄</div>
          <h2>Arraste ficheiros PDF aqui</h2>
          <p>ou clique para selecionar ficheiros</p>
          <button className="btn btn-primary">Selecionar Ficheiros PDF</button>
        </div>

        {files.length > 0 && (
          <>
            <div className="files-table">
              <table>
                <thead>
                  <tr>
                    <th>Ficheiro</th>
                    <th>NIF</th>
                    <th>Nome</th>
                    <th>Referência</th>
                    <th>Montante</th>
                    <th>Data Limite</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file, index) => (
                    <tr key={index}>
                      <td>{file.fileName}</td>
                      <td>{file.nif || '-'}</td>
                      <td>{file.taxpayerName || '-'}</td>
                      <td>{file.paymentReference || '-'}</td>
                      <td className="amount">
                        {file.amount > 0 ? `€${file.amount.toFixed(2)}` : '-'}
                      </td>
                      <td>{file.dueDate || '-'}</td>
                      <td>
                        <span className={`status-badge status-${file.status}`}>
                          {file.status === 'pending' && 'Pendente'}
                          {file.status === 'processing' && 'A processar...'}
                          {file.status === 'success' && 'Sucesso'}
                          {file.status === 'error' && 'Erro'}
                        </span>
                        {file.error && <div className="error-message">{file.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {successCount > 0 && (
              <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
                <strong>Resumo:</strong> {successCount} ficheiro(s) processado(s) com sucesso |
                Total: <span className="amount">€{totalAmount.toFixed(2)}</span>
              </div>
            )}

            <div className="action-buttons">
              <button
                className="btn btn-success"
                onClick={() => handleGenerateFile('SEPA')}
                disabled={successCount === 0}
                title="Formato XML padrão SEPA para transferências bancárias europeias"
              >
                Gerar SEPA XML ({successCount})
              </button>
              <button
                className="btn btn-success"
                onClick={() => handleGenerateFile('PS2')}
                disabled={successCount === 0}
                title="Formato PS2 português para pagamentos ao Estado"
              >
                Gerar PS2 ({successCount})
              </button>
              <button className="btn btn-primary" onClick={handleClearFiles}>
                Limpar Lista
              </button>
            </div>
          </>
        )}

        {files.length === 0 && (
          <div className="empty-state">
            <p>Nenhum ficheiro carregado</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
