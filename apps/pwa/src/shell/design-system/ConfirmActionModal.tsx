import { useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import { TextInput } from './TextInput'

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
    <Modal className="max-w-sm" labelledBy="confirm-action-title">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="confirm-action-title" className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>

        <TextInput
          id="confirm-action-input"
          label={`Ketik "${confirmWord}" buat konfirmasi`}
          autoFocus
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            variant={variant}
            className="flex-1"
            onClick={onConfirm}
            disabled={!isMatch}
            isLoading={isSubmitting}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
