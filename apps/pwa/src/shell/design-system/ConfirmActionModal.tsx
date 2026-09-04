import { useState } from 'react'
import { Button } from './Button'
import { Card } from './Card'

interface ConfirmActionModalProps {
  title: string
  description: string
  /** Kata yang harus diketik ulang persis (case-insensitive) biar tombol konfirmasi aktif. */
  confirmWord: string
  confirmLabel: string
  variant?: 'danger' | 'primary'
  isSubmitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal konfirmasi yang minta user ngetik ulang kata tertentu (bukan cuma
 * klik "OK") -- dipakai buat aksi yang gampang ke-pencet gak sengaja kalau
 * cuma window.confirm, misalnya nonaktifkan/aktifkan akun staf.
 */
export function ConfirmActionModal({
  title,
  description,
  confirmWord,
  confirmLabel,
  variant = 'danger',
  isSubmitting = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  const [typed, setTyped] = useState('')
  const isMatch = typed.trim().toLowerCase() === confirmWord.trim().toLowerCase()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <Card className="w-full max-w-sm">
        <div className="flex flex-col gap-4">
          <div>
            <h2 id="confirm-action-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="confirm-action-input" className="text-sm font-medium text-slate-700">
              Ketik "{confirmWord}" buat konfirmasi
            </label>
            <input
              id="confirm-action-input"
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
              Batal
            </Button>
            <Button
              variant={variant}
              className="flex-1"
              onClick={onConfirm}
              disabled={!isMatch || isSubmitting}
            >
              {isSubmitting ? 'Memproses...' : confirmLabel}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
