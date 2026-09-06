import { useState } from 'react'
import { adjustStock, type Product } from '../../api/products'
import { ApiRequestError } from '../../api/client'
import { Button, Modal, Select, TextInput } from '../../shell/design-system'

interface StockAdjustmentModalProps {
  product: Product
  onClose: () => void
  /** Dipanggil abis stok berhasil disesuaikan -- parent refresh daftar produk. */
  onAdjusted: () => void
}

/** Modal sesuaikan stok (FR-SI-09) -- logic PERSIS dipindah dari ProductsPage.tsx. */
export function StockAdjustmentModal({ product, onClose, onAdjusted }: StockAdjustmentModalProps) {
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState<'manual_adjustment' | 'restock'>('manual_adjustment')
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [isAdjusting, setIsAdjusting] = useState(false)

  async function handleAdjustSubmit() {
    setAdjustError(null)

    const changeQty = Number(adjustQty)
    if (!Number.isInteger(changeQty) || changeQty === 0) {
      setAdjustError('Jumlah perubahan harus bilangan bulat dan tidak boleh 0.')
      return
    }

    setIsAdjusting(true)
    try {
      await adjustStock(product.id, { change_qty: changeQty, reason: adjustReason })
      onAdjusted()
    } catch (err) {
      setAdjustError(err instanceof ApiRequestError ? err.message : 'Gagal menyesuaikan stok.')
    } finally {
      setIsAdjusting(false)
    }
  }

  return (
    <Modal className="max-w-sm" labelledBy="adjust-stock-title">
      <div className="flex flex-col gap-4">
        <h2 id="adjust-stock-title" className="text-base font-semibold text-slate-900">
          Sesuaikan Stok:
          <br />
          <span className="font-bold text-brand-600">{product.name}</span>
        </h2>
        <p className="text-sm text-slate-500">Stok saat ini: {product.stock_qty}</p>
        <TextInput
          id="adjust-qty"
          label="Perubahan (+/-)"
          type="number"
          placeholder="mis. 10 atau -5"
          value={adjustQty}
          onChange={(event) => setAdjustQty(event.target.value)}
        />
        <Select
          id="adjust-reason"
          label="Alasan"
          value={adjustReason}
          onChange={(event) => setAdjustReason(event.target.value as 'manual_adjustment' | 'restock')}
        >
          <option value="manual_adjustment">Penyesuaian Manual</option>
          <option value="restock">Restock</option>
        </Select>
        {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isAdjusting}>
            Batal
          </Button>
          <Button className="flex-1" isLoading={isAdjusting} onClick={handleAdjustSubmit}>
            Simpan
          </Button>
        </div>
      </div>
    </Modal>
  )
}
