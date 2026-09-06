import { useState } from 'react'
import { createProduct, updateProduct, type Product } from '../../api/products'
import type { Category } from '../../api/categories'
import { ApiRequestError } from '../../api/client'
import { Button, Card, Select, TextInput } from '../../shell/design-system'

interface FormState {
  name: string
  sku: string
  category_id: string
  price: string
  stock_qty: string
  low_stock_threshold: string
  unit: string
}

function formStateFor(product: Product | null): FormState {
  if (!product) {
    return { name: '', sku: '', category_id: '', price: '', stock_qty: '0', low_stock_threshold: '5', unit: '' }
  }
  return {
    name: product.name,
    sku: product.sku ?? '',
    category_id: product.category_id ?? '',
    price: String(product.price),
    stock_qty: String(product.stock_qty),
    low_stock_threshold: String(product.low_stock_threshold),
    unit: product.unit ?? '',
  }
}

interface ProductFormProps {
  /** null = mode create, ada isinya = mode edit. */
  editingProduct: Product | null
  categories: Category[]
  onCancel: () => void
  /** Dipanggil abis simpan sukses -- parent balik ke list + refresh. */
  onSaved: () => void
}

/**
 * Form Tambah/Edit Produk (FR-SI-07). Field, validasi, dan pemanggilan
 * createProduct/updateProduct PERSIS dipindah dari ProductsPage.tsx --
 * cuma layout-nya yang berubah (grid lebih lebar, actions sejajar
 * heading), bukan logic-nya.
 */
export function ProductForm({ editingProduct, categories, onCancel, onSaved }: ProductFormProps) {
  const [form, setForm] = useState<FormState>(() => formStateFor(editingProduct))
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit() {
    setFormError(null)

    const price = Number(form.price)
    if (!form.name.trim()) {
      setFormError('Nama produk wajib diisi.')
      return
    }
    if (Number.isNaN(price) || price < 0) {
      setFormError('Harga tidak valid.')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, {
          name: form.name,
          sku: form.sku || null,
          category_id: form.category_id || null,
          price,
          low_stock_threshold: Number(form.low_stock_threshold) || 0,
          unit: form.unit || null,
        })
      } else {
        const stockQty = Number(form.stock_qty)
        if (Number.isNaN(stockQty) || stockQty < 0) {
          setFormError('Stok awal tidak valid.')
          setIsSubmitting(false)
          return
        }
        await createProduct({
          name: form.name,
          sku: form.sku || undefined,
          category_id: form.category_id || undefined,
          price,
          stock_qty: stockQty,
          low_stock_threshold: Number(form.low_stock_threshold) || 5,
          unit: form.unit || undefined,
        })
      }
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Gagal menyimpan produk.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">{editingProduct ? 'Edit Produk' : 'Tambah Produk'}</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Batal
          </Button>
          <Button isLoading={isSubmitting} onClick={handleSubmit}>
            Simpan
          </Button>
        </div>
      </div>

      {formError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextInput
            id="name"
            label="Nama"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </div>

        <TextInput id="sku" label="SKU (opsional)" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
        <Select
          id="category"
          label="Kategori (opsional)"
          value={form.category_id}
          onChange={(event) => setForm({ ...form, category_id: event.target.value })}
        >
          <option value="">Tanpa Kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <TextInput
          id="price"
          label="Harga"
          type="number"
          min={0}
          value={form.price}
          onChange={(event) => setForm({ ...form, price: event.target.value })}
          required
        />
        {editingProduct ? (
          // Placeholder KOSONG -- jaga posisi grid (Batas Stok Minim &
          // Satuan tetap sejajar sama posisinya di mode create) tanpa
          // ikut nge-render input/value/name apapun, jadi TIDAK ikut
          // submit. Stok cuma bisa diubah lewat StockAdjustmentModal.
          <div aria-hidden className="hidden sm:block" />
        ) : (
          <TextInput
            id="stock_qty"
            label="Stok Awal"
            type="number"
            min={0}
            value={form.stock_qty}
            onChange={(event) => setForm({ ...form, stock_qty: event.target.value })}
            required
          />
        )}

        <TextInput
          id="low_stock_threshold"
          label="Batas Stok Minim"
          type="number"
          min={0}
          value={form.low_stock_threshold}
          onChange={(event) => setForm({ ...form, low_stock_threshold: event.target.value })}
        />
        <TextInput
          id="unit"
          label="Satuan (opsional)"
          placeholder="pcs, kg, dus..."
          value={form.unit}
          onChange={(event) => setForm({ ...form, unit: event.target.value })}
        />
      </div>
    </Card>
  )
}
