export type BadgeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-500',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-green-100 text-green-700',
  danger: 'bg-red-100 text-red-700',
}

interface StatusBadgeProps {
  label: string
  tone: BadgeTone
}

/**
 * Pill status/role standar -- dipakai di semua halaman list (order,
 * ticket, produk, staf, transaksi, platform). Pemetaan "status apa ->
 * tone apa" TETAP jadi tanggung jawab tiap halaman (business logic-nya
 * di sana); component ini cuma merender pill-nya secara konsisten.
 */
export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>{label}</span>
}
