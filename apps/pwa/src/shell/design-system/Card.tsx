import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

/** Wadah dasar buat konten -- dashboard tiles, form, list, dll. */
export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}
