import type { InputHTMLAttributes } from 'react'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  error?: string
}

/** Field berlabel dasar -- dipakai di form-form (Staf, Pengaturan Toko, dll). */
export function TextInput({ label, id, error, className = '', ...rest }: TextInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={`rounded-lg border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
          error ? 'border-red-400' : 'border-slate-300'
        } ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
