import { useRef, useState, type DragEvent } from 'react'
import { FiFileText, FiUploadCloud } from 'react-icons/fi'
import { getImportJob, startImport, type ImportJob } from '../../api/products'
import { ApiRequestError } from '../../api/client'
import { Button, Modal } from '../../shell/design-system'

const IMPORT_POLL_MS = 2000

interface ImportProductModalProps {
  onClose: () => void
  /** Dipanggil abis job import selesai (status != pending/processing) -- parent refresh daftar produk. */
  onImported: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Modal import massal .xlsx (FR-SI-08). Business logic (startImport,
 * polling getImportJob tiap 2 detik, onImported) PERSIS SAMA -- yang
 * berubah cuma cara file-nya kepilih (dropzone drag&drop + klik,
 * bukan `<input type="file">` polos): file yang dipilih ditaruh di
 * state `selectedFile`, lalu dioper ke startImport() yang sama persis
 * kayak sebelumnya. Extension .xlsx tetap satu-satunya yang diterima
 * (sebelumnya lewat atribut `accept` di input -- itu gak berlaku buat
 * drag&drop, jadi dicek manual di sini biar konsisten, BUKAN aturan
 * baru). Ukuran 5MB TETAP divalidasi backend (lewat pesan error yang
 * sudah ada), tidak ditambah pengecekan baru di sini.
 */
export function ImportProductModal({ onClose, onImported }: ImportProductModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelected(file: File | null) {
    setImportError(null)
    setImportJob(null)
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setSelectedFile(null)
      setImportError('File harus berformat .xlsx.')
      return
    }
    setSelectedFile(file)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (isImporting) return
    handleFileSelected(event.dataTransfer.files?.[0] ?? null)
  }

  function pollImportJob(jobId: string) {
    const poll = async () => {
      try {
        const job = await getImportJob(jobId)
        setImportJob(job)
        if (job.status === 'pending' || job.status === 'processing') {
          setTimeout(poll, IMPORT_POLL_MS)
        } else {
          setIsImporting(false)
          onImported()
        }
      } catch (err) {
        setIsImporting(false)
        setImportError(err instanceof ApiRequestError ? err.message : 'Gagal memantau status import.')
      }
    }
    setTimeout(poll, IMPORT_POLL_MS)
  }

  async function handleImportFile() {
    if (!selectedFile) {
      setImportError('Pilih file .xlsx dulu.')
      return
    }

    setImportError(null)
    setImportJob(null)
    setIsImporting(true)
    try {
      const { job_id } = await startImport(selectedFile)
      pollImportJob(job_id)
    } catch (err) {
      setIsImporting(false)
      setImportError(err instanceof ApiRequestError ? err.message : 'Gagal mengunggah file import.')
    }
  }

  return (
    <Modal className="max-w-md" labelledBy="import-product-title">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="import-product-title" className="text-lg font-bold text-slate-900">
            Import Produk Massal
          </h2>
          <p className="mt-1 text-sm text-slate-500">File .xlsx, maksimal 5MB.</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          disabled={isImporting}
          onChange={(event) => handleFileSelected(event.target.files?.[0] ?? null)}
        />

        {selectedFile ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <FiFileText aria-hidden="true" className="h-8 w-8 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{selectedFile.name}</p>
              <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="shrink-0 cursor-pointer text-sm font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ganti file
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <FiUploadCloud aria-hidden="true" className="mb-1 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Drag & drop file XLSX di sini</p>
            <p className="text-xs text-slate-500">atau klik untuk memilih file</p>
            <p className="mt-1 text-xs text-slate-400">Maksimal 5 MB</p>
          </div>
        )}

        {importError && <p className="text-sm text-red-600">{importError}</p>}

        {importJob && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <p>
              Status: <span className="font-medium">{importJob.status}</span>
              {importJob.total_rows !== null && ` -- ${importJob.total_rows} baris`}
            </p>
            {importJob.status === 'completed' && (
              <p>
                Dibuat: {importJob.created ?? 0}, Diperbarui: {importJob.updated ?? 0}, Gagal: {importJob.failed ?? 0}
              </p>
            )}
            {importJob.message && <p>{importJob.message}</p>}
            {importJob.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-red-600">
                {importJob.errors.map((e, i) => (
                  <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isImporting}>
            Tutup
          </Button>
          <Button isLoading={isImporting} disabled={!selectedFile} onClick={handleImportFile}>
            Import
          </Button>
        </div>
      </div>
    </Modal>
  )
}
