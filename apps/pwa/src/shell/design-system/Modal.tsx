import type { ReactNode } from 'react'
import { Card } from './Card'

interface ModalProps {
  children: ReactNode
  className?: string
  /** id elemen judul di dalam `children`, buat `aria-labelledby` -- opsional, tapi disarankan kalau modalnya punya judul. */
  labelledBy?: string
}

/**
 * Overlay + Card generik buat semua dialog modal (form kecil, konfirmasi,
 * dst). SENGAJA tidak ada close-on-backdrop-click atau Escape-to-close --
 * belum ada modal manapun di app ini yang punya behavior itu, nambahin di
 * sini berarti mengubah behavior semua pemanggil sekaligus, di luar scope
 * "reusable wrapper". Penutupan tetap tanggung jawab pemanggil (tombol
 * Batal/Cancel eksplisit).
 */
export function Modal({ children, className = '', labelledBy }: ModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <Card className={`w-full ${className}`}>{children}</Card>
    </div>
  )
}
