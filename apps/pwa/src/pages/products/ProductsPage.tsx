import { useEffect, useRef, useState } from 'react'
import {
  adjustStock,
  createProduct,
  fetchProducts,
  getImportJob,
  startImport,
  updateProduct,
  type ImportJob,
  type Product,
} from '../../api/products'
import { fetchCategories, type Category } from '../../api/categories'
import { ApiRequestError } from '../../api/client'
import {
  Button,
  Card,
  ConfirmActionModal,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  TextInput,
} from '../../shell/design-system'
import { formatRupiah } from '../../shell/currency'

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

type StatusFilter = 'all' | 'active' | 'inactive'

interface FormState {
  name: string
  sku: string
  category_id: string
  price: string
  stock_qty: string
  low_stock_threshold: string
  unit: string
}

const EMPTY_FORM: FormState = {
  name: '',
  sku: '',
  category_id: '',
  price: '',
  stock_qty: '0',
  low_stock_threshold: '5',
  unit: '',
}

const IMPORT_POLL_MS = 2000

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState<'manual_adjustment' | 'restock'>('manual_adjustment')
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [isAdjusting, setIsAdjusting] = useState(false)

  const [pendingDeactivate, setPendingDeactivate] = useState<Product | null>(null)
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false)

  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setView('form')
  }

  function openEditForm(product: Product) {
    setEditingId(product.id)
    setForm({
      name: product.name,
      sku: product.sku ?? '',
      category_id: product.category_id ?? '',
      price: String(product.price),
      stock_qty: String(product.stock_qty),
      low_stock_threshold: String(product.low_stock_threshold),
      unit: product.unit ?? '',
    })
    setFormError(null)
    setView('form')
  }

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
      if (editingId) {
        await updateProduct(editingId, {
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
      setView('list')
      await refreshList()
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Gagal menyimpan produk.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function openAdjustModal(product: Product) {
    setAdjustingProduct(product)
    setAdjustQty('')
    setAdjustReason('manual_adjustment')
    setAdjustError(null)
  }

  async function handleAdjustSubmit() {
    if (!adjustingProduct) return
    setAdjustError(null)

    const changeQty = Number(adjustQty)
    if (!Number.isInteger(changeQty) || changeQty === 0) {
      setAdjustError('Jumlah perubahan harus bilangan bulat dan tidak boleh 0.')
      return
    }

    setIsAdjusting(true)
    try {
      await adjustStock(adjustingProduct.id, { change_qty: changeQty, reason: adjustReason })
      setAdjustingProduct(null)
      await refreshList()
    } catch (err) {
      setAdjustError(err instanceof ApiRequestError ? err.message : 'Gagal menyesuaikan stok.')
    } finally {
      setIsAdjusting(false)
    }
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

  function pollImportJob(jobId: string) {
    const poll = async () => {
      try {
        const job = await getImportJob(jobId)
        setImportJob(job)
        if (job.status === 'pending' || job.status === 'processing') {
          setTimeout(poll, IMPORT_POLL_MS)
        } else {
          setIsImporting(false)
          await refreshList()
        }
      } catch (err) {
        setIsImporting(false)
        setImportError(err instanceof ApiRequestError ? err.message : 'Gagal memantau status import.')
      }
    }
    setTimeout(poll, IMPORT_POLL_MS)
  }

  async function handleImportFile() {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setImportError('Pilih file .xlsx dulu.')
      return
    }

    setImportError(null)
    setImportJob(null)
    setIsImporting(true)
    try {
      const { job_id } = await startImport(file)
      pollImportJob(job_id)
    } catch (err) {
      setIsImporting(false)
      setImportError(err instanceof ApiRequestError ? err.message : 'Gagal mengunggah file import.')
    }
  }

  const hasNextPage = page * pageSize < total

  if (view === 'form') {
    return (
      <>
        <PageHeader title={editingId ? 'Edit Produk' : 'Tambah Produk'} />
        <Card className="max-w-md">
          <div className="flex flex-col gap-4">
            <TextInput
              id="name"
              label="Nama"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
            <TextInput
              id="sku"
              label="SKU (opsional)"
              value={form.sku}
              onChange={(event) => setForm({ ...form, sku: event.target.value })}
            />
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
            {!editingId && (
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

            {formError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setView('list')} disabled={isSubmitting}>
                Batal
              </Button>
              <Button className="flex-1" isLoading={isSubmitting} onClick={handleSubmit}>
                Simpan
              </Button>
            </div>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Produk"
        description="Kelola produk, stok, & import massal (FR-SI-07, FR-SI-08)."
        actions={<Button onClick={openCreateForm}>Tambah Produk</Button>}
      />

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
          <Select id="category-filter" label="Kategori" value={categoryFilter} onChange={(event) => updateCategoryFilter(event.target.value)}>
            <option value="">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
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
      </Card>

      <Card className="mb-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-700">Import Produk Massal (.xlsx, maks 5MB)</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="text-sm"
              disabled={isImporting}
            />
            <Button variant="secondary" isLoading={isImporting} onClick={handleImportFile}>
              Import
            </Button>
          </div>
          {importError && <p className="text-sm text-red-600">{importError}</p>}
          {importJob && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                Status: <span className="font-medium">{importJob.status}</span>
                {importJob.total_rows !== null && ` -- ${importJob.total_rows} baris`}
              </p>
              {importJob.status === 'completed' && (
                <p>
                  Dibuat: {importJob.created ?? 0}, Diperbarui: {importJob.updated ?? 0}, Gagal:{' '}
                  {importJob.failed ?? 0}
                </p>
              )}
              {importJob.message && <p>{importJob.message}</p>}
              {importJob.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-red-600">
                  {importJob.errors.map((e, i) => (
                    <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 font-medium">Nama</th>
                <th className="pb-2 font-medium">Kategori</th>
                <th className="pb-2 font-medium">Harga</th>
                <th className="pb-2 font-medium">Stok</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">
                    {product.name}
                    {product.sku && <span className="ml-1 text-xs text-slate-400">({product.sku})</span>}
                  </td>
                  <td className="py-2 text-slate-500">{categoryName(product.category_id)}</td>
                  <td className="py-2">{formatRupiah(product.price)}</td>
                  <td className="py-2">
                    <span className={product.stock_qty <= product.low_stock_threshold ? 'font-medium text-red-600' : ''}>
                      {product.stock_qty}
                    </span>{' '}
                    {product.unit}
                  </td>
                  <td className="py-2">
                    <StatusBadge label={product.is_active ? 'Aktif' : 'Nonaktif'} tone={product.is_active ? 'success' : 'neutral'} />
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-brand-600 hover:underline"
                        onClick={() => openEditForm(product)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-brand-600 hover:underline"
                        onClick={() => openAdjustModal(product)}
                      >
                        Stok
                      </button>
                      {product.is_active ? (
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => setPendingDeactivate(product)}
                        >
                          Nonaktifkan
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-green-600 hover:underline"
                          onClick={() => handleActivate(product)}
                        >
                          Aktifkan
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {adjustingProduct && (
        <Modal className="max-w-sm" labelledBy="adjust-stock-title">
          <div className="flex flex-col gap-4">
            <h2 id="adjust-stock-title" className="text-base font-semibold text-slate-900">
              Sesuaikan Stok -- {adjustingProduct.name}
            </h2>
            <p className="text-sm text-slate-500">Stok saat ini: {adjustingProduct.stock_qty}</p>
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
              <Button variant="secondary" className="flex-1" onClick={() => setAdjustingProduct(null)} disabled={isAdjusting}>
                Batal
              </Button>
              <Button className="flex-1" isLoading={isAdjusting} onClick={handleAdjustSubmit}>
                Simpan
              </Button>
            </div>
          </div>
        </Modal>
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
