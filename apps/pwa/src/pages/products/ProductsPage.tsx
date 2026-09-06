import { useEffect, useState } from 'react'
import { fetchProducts, updateProduct, type Product } from '../../api/products'
import { fetchCategories, type Category } from '../../api/categories'
import { ApiRequestError } from '../../api/client'
import {
  Button,
  Card,
  ConfirmActionModal,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  Select,
  StatusBadge,
  TextInput,
} from '../../shell/design-system'
import { formatRupiah } from '../../shell/currency'
import { FiPlus, FiUpload } from 'react-icons/fi'
import { ImportProductModal } from './ImportProductModal'
import { ProductActions } from './ProductActions'
import { ProductForm } from './ProductForm'
import { StockAdjustmentModal } from './StockAdjustmentModal'

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

type StatusFilter = 'all' | 'active' | 'inactive'

// Sort ini CLIENT-SIDE, cuma ngurutin produk yang lagi ke-load di
// HALAMAN INI (bukan seluruh dataset) -- GET /products belum punya
// param sort/order_by (dicek langsung ke fetchProducts() & backend
// routes.ts, gak ada). Kalau nanti perlu sort lintas-halaman/dataset
// penuh, itu perlu endpoint baru -- enhancement API terpisah, di luar
// scope task UI-only ini.
type SortColumn = 'name' | 'price' | 'stock_qty'
type SortDirection = 'asc' | 'desc'

interface SortableHeaderProps {
  column: SortColumn
  label: string
  sortColumn: SortColumn | null
  sortDirection: SortDirection
  onSort: (column: SortColumn) => void
}

/**
 * `<th>` yang bisa diklik buat sort -- indicator panah + aria-sort,
 * dipakai kolom Nama/Harga/Stok. Header bg gelap (brand-800), jadi
 * teks/panahnya putih -- SEMUA kolom (termasuk yang sortable) di-center
 * secara horizontal, panah selalu nempel di sebelah kanan teks.
 * Indicator-nya karakter panah polos (↕/↑/↓), bukan icon component --
 * lebih ringkas & persis kayak yang diminta ("NAMA PRODUK ↕").
 */
function SortableHeader({ column, label, sortColumn, sortDirection, onSort }: SortableHeaderProps) {
  const isActive = sortColumn === column
  return (
    <th
      scope="col"
      aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex cursor-pointer items-center justify-center gap-1 hover:text-white/80 ${
          isActive ? 'font-bold' : ''
        }`}
      >
        {label}
        <span aria-hidden="true" className={isActive ? 'text-white' : 'text-white/50'}>
          {isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)

  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null)
  const [pendingDeactivate, setPendingDeactivate] = useState<Product | null>(null)
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false)

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  function categoryName(categoryId: string | null) {
    return categories.find((c) => c.id === categoryId)?.name ?? '-'
  }

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateCategoryFilter(value: string) {
    setCategoryFilter(value)
    setPage(1)
  }

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function updatePageSize(newPageSize: PageSize) {
    setPageSize(newPageSize)
    setPage(1)
  }

  async function loadProducts() {
    return fetchProducts({
      search: search.trim() || undefined,
      category_id: categoryFilter || undefined,
      is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
      page,
      limit: pageSize,
    })
  }

  // SATU chain promise (reset isLoading/loadError lewat .then(), bukan
  // sinkron di badan efek) -- pola yang sama kayak OrdersPage.tsx, biar
  // gak kena react-hooks/set-state-in-effect.
  useEffect(() => {
    Promise.resolve()
      .then(() => {
        setIsLoading(true)
        setLoadError(null)
        return Promise.all([loadProducts(), fetchCategories()])
      })
      .then(([result, categoryList]) => {
        setProducts(result.data)
        setTotal(result.total)
        setCategories(categoryList)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat daftar produk.')
      })
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, statusFilter, page, pageSize])

  async function refreshList() {
    try {
      const result = await loadProducts()
      setProducts(result.data)
      setTotal(result.total)
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal memuat ulang daftar produk.')
    }
  }

  function openCreateForm() {
    setEditingProduct(null)
    setView('form')
  }

  function openEditForm(product: Product) {
    setEditingProduct(product)
    setView('form')
  }

  async function handleConfirmDeactivate() {
    if (!pendingDeactivate) return
    setIsConfirmSubmitting(true)
    try {
      await updateProduct(pendingDeactivate.id, { is_active: false })
      setPendingDeactivate(null)
      await refreshList()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal menonaktifkan produk.')
    } finally {
      setIsConfirmSubmitting(false)
    }
  }

  async function handleActivate(product: Product) {
    try {
      await updateProduct(product.id, { is_active: true })
      await refreshList()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal mengaktifkan produk.')
    }
  }

  const hasNextPage = page * pageSize < total

  const sortedProducts = sortColumn
    ? [...products].sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1
        if (sortColumn === 'name') return a.name.localeCompare(b.name) * dir
        return (a[sortColumn] - b[sortColumn]) * dir
      })
    : products

  if (view === 'form') {
    return (
      <ProductForm
        editingProduct={editingProduct}
        categories={categories}
        onCancel={() => setView('list')}
        onSaved={() => {
          setView('list')
          refreshList()
        }}
      />
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-start gap-2">
        <Button variant="secondary" onClick={() => setIsImportModalOpen(true)}>
          <FiUpload aria-hidden="true" />
          Import Produk
        </Button>
        <Button onClick={openCreateForm}>
          <FiPlus aria-hidden="true" />
          Tambah Produk
        </Button>
      </div>

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextInput
              id="product-search"
              label="Cari"
              placeholder="Cari nama atau SKU..."
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
            />
          </div>
          <div className="sm:w-44">
            <Select id="category-filter" label="Kategori" value={categoryFilter} onChange={(event) => updateCategoryFilter(event.target.value)}>
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:w-36">
            <Select
              id="status-filter"
              label="Status"
              value={statusFilter}
              onChange={(event) => updateStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </Select>
          </div>
          <div className="sm:w-32">
            <Select
              id="page-size"
              label="Per Halaman"
              value={pageSize}
              onChange={(event) => updatePageSize(Number(event.target.value) as PageSize)}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState description={loadError} />
      ) : products.length === 0 ? (
        <EmptyState title="Belum ada produk" description='Klik "Tambah Produk" atau import file .xlsx buat mulai.' />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-brand-900 bg-brand-800">
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">SKU</th>
                  <SortableHeader
                    column="name"
                    label="NAMA PRODUK"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">KATEGORI</th>
                  <SortableHeader
                    column="price"
                    label="HARGA"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column="stock_qty"
                    label="STOK"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">STATUS</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-500">{product.sku || '-'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                    <td className="px-4 py-3 text-slate-500">{categoryName(product.category_id)}</td>
                    <td className="px-4 py-3 text-right">{formatRupiah(product.price)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          product.stock_qty <= product.low_stock_threshold
                            ? 'font-semibold text-red-600'
                            : 'font-medium text-slate-700'
                        }
                      >
                        {product.stock_qty}
                      </span>{' '}
                      <span className="text-slate-400">{product.unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={product.is_active ? 'Aktif' : 'Nonaktif'} tone={product.is_active ? 'success' : 'neutral'} />
                    </td>
                    <td className="px-4 py-3">
                      <ProductActions
                        product={product}
                        onEdit={() => openEditForm(product)}
                        onAdjustStock={() => setAdjustingProduct(product)}
                        onDeactivate={() => setPendingDeactivate(product)}
                        onActivate={() => handleActivate(product)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!isLoading && !loadError && (products.length > 0 || page > 1) && (
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(total / pageSize))}
          hasNextPage={hasNextPage}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      )}

      {isImportModalOpen && (
        <ImportProductModal
          onClose={() => setIsImportModalOpen(false)}
          onImported={() => refreshList()}
        />
      )}

      {adjustingProduct && (
        <StockAdjustmentModal
          product={adjustingProduct}
          onClose={() => setAdjustingProduct(null)}
          onAdjusted={() => {
            setAdjustingProduct(null)
            refreshList()
          }}
        />
      )}

      {pendingDeactivate && (
        <ConfirmActionModal
          title="Nonaktifkan Produk"
          description={`Produk "${pendingDeactivate.name}" gak akan muncul lagi di POS/katalog sampai diaktifkan lagi.`}
          confirmWord="nonaktifkan"
          confirmLabel="Nonaktifkan"
          variant="danger"
          isSubmitting={isConfirmSubmitting}
          onConfirm={handleConfirmDeactivate}
          onCancel={() => setPendingDeactivate(null)}
        />
      )}
    </>
  )
}
