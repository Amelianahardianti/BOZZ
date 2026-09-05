import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  id: string
  error?: string
}

/** Dropdown berlabel dasar -- API meniru TextInput. `<option>` dioper apa adanya lewat children. */
export function Select({ label, id, error, className = '', children, ...rest }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        className={`rounded-lg border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
          error ? 'border-red-400' : 'border-slate-300'
        } ${className}`}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
