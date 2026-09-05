import type { InputHTMLAttributes, ReactNode } from 'react'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  error?: string
  /** Slot kecil di kanan dalam input (mis. tombol show/hide password) -- opsional, dipakai LoginPage. */
  endAdornment?: ReactNode
}

/** Field berlabel dasar -- dipakai di form-form (Staf, Pengaturan Toko, Login, dll). */
export function TextInput({ label, id, error, className = '', endAdornment, ...rest }: TextInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
            error ? 'border-red-400' : 'border-slate-300'
          } ${endAdornment ? 'pr-10' : ''} ${className}`}
          {...rest}
        />
        {endAdornment && <div className="absolute inset-y-0 right-0 flex items-center pr-2">{endAdornment}</div>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
