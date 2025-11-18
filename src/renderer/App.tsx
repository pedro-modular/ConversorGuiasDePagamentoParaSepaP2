import React, { useState, useRef, useEffect } from 'react'
import { PaymentData, ExportFormat } from '../shared/types'
import logo from './assets/patrocinio-logo-white.png'

// Modal component for manual field editing
interface EditModalProps {
  file: PaymentData
  onSave: (updatedFile: PaymentData) => void
  onCancel: () => void
}

const EditModal: React.FC<EditModalProps> = ({ file, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    nif: file.nif,
    taxpayerName: file.taxpayerName,
    paymentReference: file.paymentReference,
    amount: file.amount.toString(),
    dueDate: file.dueDate,
    documentNumber: file.documentNumber
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Clean payment reference (remove dots and spaces)
    const cleanedReference = formData.paymentReference.replace(/[\s.]/g, '')

    onSave({
      ...file,
      nif: formData.nif.trim(),
      taxpayerName: formData.taxpayerName.trim(),
      paymentReference: cleanedReference,
      entity: cleanedReference.substring(0, 3),
      amount: parseFloat(formData.amount.replace(',', '.')) || 0,
      dueDate: formData.dueDate.trim(),
      documentNumber: formData.documentNumber.trim(),
      status: 'success',
      error: undefined
    })
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Completar Dados - {file.fileName}</h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-section">
              <h3>Campos Extraídos</h3>
              <p className="form-hint">Preencha ou corrija os campos em falta (marcados a vermelho)</p>

              <div className="form-grid">
                <div className={`form-group ${!formData.nif ? 'missing' : ''}`}>
                  <label>NIF *</label>
                  <input
                    type="text"
                    value={formData.nif}
                    onChange={e => handleChange('nif', e.target.value)}
                    placeholder="123456789"
                    maxLength={9}
                  />
                </div>

                <div className="form-group">
                  <label>Nome</label>
                  <input
                    type="text"
                    value={formData.taxpayerName}
                    onChange={e => handleChange('taxpayerName', e.target.value)}
                    placeholder="Nome do contribuinte"
                  />
                </div>

                <div className={`form-group ${!formData.paymentReference ? 'missing' : ''}`}>
                  <label>Referência de Pagamento *</label>
                  <input
                    type="text"
                    value={formData.paymentReference}
                    onChange={e => handleChange('paymentReference', e.target.value)}
                    placeholder="156.080.671.478.311"
                  />
                </div>

                <div className={`form-group ${!formData.amount || formData.amount === '0' ? 'missing' : ''}`}>
                  <label>Valor a Pagar (€) *</label>
                  <input
                    type="text"
                    value={formData.amount}
                    onChange={e => handleChange('amount', e.target.value)}
                    placeholder="110,40"
                  />
                </div>

                <div className="form-group">
                  <label>Data Limite</label>
                  <input
                    type="text"
                    value={formData.dueDate}
                    onChange={e => handleChange('dueDate', e.target.value)}
                    placeholder="2025-01-20"
                  />
                </div>

                <div className="form-group">
                  <label>Nº Documento</label>
                  <input
                    type="text"
                    value={formData.documentNumber}
                    onChange={e => handleChange('documentNumber', e.target.value)}
                    placeholder="8067 1478311"
                  />
                </div>
              </div>
            </div>

            {file.extractedText && (
              <div className="form-section">
                <h3>Texto Extraído (OCR)</h3>
                <p className="form-hint">Consulte o texto extraído para encontrar os valores em falta</p>
                <textarea
                  className="ocr-text"
                  readOnly
                  value={file.extractedText}
                  rows={10}
                />
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!formData.nif || !formData.paymentReference || !formData.amount || formData.amount === '0'}
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const App: React.FC = () => {
  const [files, setFiles] = useState<PaymentData[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('...')
  const [editingFile, setEditingFile] = useState<{ index: number; file: PaymentData } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load app version from package.json (single source of truth)
  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion)
  }, [])

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
      } else if (result.needsReview && result.data) {
        // Partial extraction - needs manual review
        setFiles(prev => {
          const updated = [...prev]
          updated[fileIndex] = {
            ...updated[fileIndex],
            ...result.data,
            status: 'needs_review',
            error: result.error || 'Campos em falta',
            extractedText: result.extractedText
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

  const handleEditFile = (index: number) => {
    setEditingFile({ index, file: files[index] })
  }

  const handleSaveEdit = (updatedFile: PaymentData) => {
    if (editingFile) {
      setFiles(prev => {
        const updated = [...prev]
        updated[editingFile.index] = updatedFile
        return updated
      })
      setEditingFile(null)
    }
  }

  const handleCancelEdit = () => {
    setEditingFile(null)
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

  const handleOpenLog = async () => {
    const result = await window.electronAPI.openLogFile()
    if (result.success) {
      alert(`Log file aberto:\n${result.path}`)
    }
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
            <span className="version">v{appVersion}</span>
          </div>
          <p>Converta guias de pagamento PDF em ficheiros SEPA XML ou PS2</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button
            onClick={handleOpenLog}
            className="btn-link"
            title="Abrir ficheiro de debug logs"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              padding: '5px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            🐛 Debug Log
          </button>
          <a href="https://patrocinio.pt" target="_blank" rel="noopener noreferrer" className="company-link">
            patrocinio.pt
          </a>
        </div>
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
                          {file.status === 'needs_review' && 'Revisão'}
                        </span>
                        {file.status === 'needs_review' && (
                          <button
                            className="btn-edit"
                            onClick={() => handleEditFile(index)}
                            title="Completar dados manualmente"
                          >
                            ✏️ Editar
                          </button>
                        )}
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

      {/* Modal for editing files that need review */}
      {editingFile && (
        <EditModal
          file={editingFile.file}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
        />
      )}
    </div>
  )
}

export default App
