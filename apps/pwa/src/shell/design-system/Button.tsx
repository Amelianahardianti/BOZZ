import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

/**
 * Tombol dasar dipakai di seluruh halaman. Target sentuh minimal 44px
 * (NFR-05 -- aksi penting di Kasir/Fulfillment maksimal 1-2 tap, harus
 * gampang di-tap di layar HP).
 */
export function Button({ variant = 'primary', className = '', disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
