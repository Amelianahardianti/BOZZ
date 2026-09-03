import { Button } from '../../shell/design-system'
import { formatRupiah } from '../../shell/currency'
import type { CartItem } from './types'

interface CartPanelProps {
  items: CartItem[]
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
  onCheckout: () => void
}

export function CartPanel({ items, onIncrement, onDecrement, onRemove, onCheckout }: CartPanelProps) {
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.qty, 0)

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Keranjang</h2>

      {items.length === 0 ? (
        <p className="flex-1 py-8 text-center text-sm text-slate-400">Belum ada barang dipilih.</p>
      ) : (
        <ul className="flex-1 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li key={item.product.id} className="rounded-lg border border-slate-200 p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{item.product.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(item.product.id)}
                  aria-label={`Hapus ${item.product.name} dari keranjang`}
                  className="text-xs text-red-500"
                >
                  Hapus
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDecrement(item.product.id)}
                    aria-label={`Kurangi qty ${item.product.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-600"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-sm">{item.qty}</span>
                  <button
                    type="button"
                    onClick={() => onIncrement(item.product.id)}
                    aria-label={`Tambah qty ${item.product.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-600"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm font-semibold text-slate-900">
                  {formatRupiah(item.product.price * item.qty)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">Subtotal</span>
          <span className="text-lg font-bold text-slate-900">{formatRupiah(subtotal)}</span>
        </div>
        <Button className="w-full" disabled={items.length === 0} onClick={onCheckout}>
          Bayar
        </Button>
      </div>
    </div>
  )
}
