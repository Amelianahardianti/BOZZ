import { FiEdit2, FiLink, FiPackage, FiPower } from 'react-icons/fi'
import type { Product } from '../../api/products'

interface ProductActionsProps {
  product: Product
  onEdit: () => void
  onAdjustStock: () => void
  /** Buka MarketplaceMappingModal (Task 10B) -- disabled buat produk nonaktif, lihat komentar di tombolnya. */
  onMapping: () => void
  /** Buka ConfirmActionModal (dirender sekali di ProductsPage, bukan di sini) -- behavior TIDAK berubah, tetap minta konfirmasi. */
  onDeactivate: () => void
  /** Langsung panggil API tanpa konfirmasi -- behavior TIDAK berubah. */
  onActivate: () => void
}

const TEXT_BUTTON_CLASSES =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors'

/** Icon-only (Nonaktifkan/Aktifkan) -- kotak sedang, title/aria-label yang jelasin fungsinya buat assistive tech & tooltip browser. */
const ICON_BUTTON_CLASSES = 'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors'

/**
 * 3 aksi per baris tabel produk. Edit & Stok tetap icon + teks. Nonaktifkan/
 * Aktifkan icon-only (biar kolom Aksi gak lebar-lebar amat) -- title/
 * aria-label tetap ada, jadi fungsinya tetap jelas lewat tooltip browser
 * & assistive tech walau teksnya dihilangin dari tampilan.
 */
export function ProductActions({ product, onEdit, onAdjustStock, onMapping, onDeactivate, onActivate }: ProductActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Edit produk"
        aria-label="Edit produk"
        onClick={onEdit}
        className={`${TEXT_BUTTON_CLASSES} text-slate-600 hover:bg-slate-100`}
      >
        <FiEdit2 aria-hidden="true" className="h-4.5 w-4.5" />
        Edit
      </button>
      <button
        type="button"
        title="Sesuaikan stok"
        aria-label="Sesuaikan stok"
        onClick={onAdjustStock}
        className={`${TEXT_BUTTON_CLASSES} text-slate-600 hover:bg-slate-100`}
      >
        <FiPackage aria-hidden="true" className="h-4.5 w-4.5" />
        Stok
      </button>
      <button
        type="button"
        title={product.is_active ? 'Kelola mapping marketplace' : 'Mapping tidak tersedia untuk produk nonaktif'}
        aria-label={product.is_active ? 'Kelola mapping marketplace' : 'Mapping tidak tersedia untuk produk nonaktif'}
        onClick={onMapping}
        disabled={!product.is_active}
        className={`${TEXT_BUTTON_CLASSES} text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`}
      >
        <FiLink aria-hidden="true" className="h-4.5 w-4.5" />
        Mapping
      </button>
      {product.is_active ? (
        <button
          type="button"
          title="Nonaktifkan produk"
          aria-label="Nonaktifkan produk"
          onClick={onDeactivate}
          className={`${ICON_BUTTON_CLASSES} text-red-600 hover:bg-red-50`}
        >
          <FiPower aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          title="Aktifkan produk"
          aria-label="Aktifkan produk"
          onClick={onActivate}
          className={`${ICON_BUTTON_CLASSES} text-green-600 hover:bg-green-50`}
        >
          <FiPower aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
