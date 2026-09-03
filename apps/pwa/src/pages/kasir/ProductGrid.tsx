import { useMemo, useState } from 'react'
import { formatRupiah } from '../../shell/currency'
import type { CachedCategory, CachedProduct } from '../../shell/offline/db'

interface ProductGridProps {
  products: CachedProduct[]
  categories: CachedCategory[]
  onAdd: (product: CachedProduct) => void
}

/**
 * Daftar produk buat Kasir milih barang. 1 tap = langsung masuk
 * keranjang (NFR-05: aksi penting maks 1-2 tap). Data dari cache
 * lokal (props dari KasirPage via getCachedProducts()) -- bukan fetch
 * di sini, biar tetap instan walau offline (NFR-01).
 */
export function ProductGrid({ products, categories, onAdd }: ProductGridProps) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesSearch =
        query.length === 0 ||
        product.name.toLowerCase().includes(query) ||
        (product.sku?.toLowerCase().includes(query) ?? false)
      const matchesCategory = categoryId === null || product.category_id === categoryId
      return matchesSearch && matchesCategory
    })
  }, [products, search, categoryId])

  return (
    <div className="flex h-full flex-col">
      <input
        type="search"
        placeholder="Cari produk atau SKU..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mb-3 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            categoryId === null ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Semua
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryId(category.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              categoryId === category.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {products.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-400">
          Belum ada produk di cache. Pastikan koneksi internet nyala minimal sekali buat sinkronisasi awal.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-400">Gak ada produk yang cocok.</p>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onAdd(product)}
              disabled={product.stock_qty <= 0}
              className="flex flex-col items-start rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-sm font-medium text-slate-900">{product.name}</span>
              <span className="mt-1 text-sm font-semibold text-brand-700">{formatRupiah(product.price)}</span>
              <span className="mt-0.5 text-xs text-slate-400">
                {product.stock_qty <= 0 ? 'Stok habis' : `Stok ${product.stock_qty}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
