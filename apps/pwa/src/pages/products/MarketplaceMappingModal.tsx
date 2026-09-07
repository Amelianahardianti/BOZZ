import { useEffect, useState } from 'react'
import { FiEdit2, FiTrash2 } from 'react-icons/fi'
import {
  createProductMapping,
  deleteProductMapping,
  fetchProductMappings,
  updateProductMapping,
  type Product,
  type ProductMapping,
} from '../../api/products'
import { fetchPlatforms, type Platform } from '../../api/platforms'
import { ApiRequestError } from '../../api/client'
import { Button, LoadingState, Modal, Select, TextInput } from '../../shell/design-system'

interface MarketplaceMappingModalProps {
  product: Product
  onClose: () => void
}

/**
 * Kelola channel_listings satu produk (Task 10B) -- pola SAMA seperti
 * StockAdjustmentModal (form + submit + inline error), ditambah daftar
 * "Current Mappings" di bawahnya buat Edit/Remove baris yang sudah ada.
 * TIDAK ada page/route baru -- murni modal, dibuka dari ProductActions.
 */
export function MarketplaceMappingModal({ product, onClose }: MarketplaceMappingModalProps) {
  const [mappings, setMappings] = useState<ProductMapping[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedPlatformId, setSelectedPlatformId] = useState('')
  const [externalItemId, setExternalItemId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Diisi begitu backend balas 409 (external_item_id ini sudah dipakai
  // produk lain) -- tombol "Pindahkan" muncul, cuma kalau state ini ada.
  // TIDAK PERNAH overwrite diam-diam (Task 10B Phase 12) -- submit ulang
  // dengan reassign:true HANYA terjadi kalau user benar-benar klik tombol ini.
  const [pendingReassign, setPendingReassign] = useState(false)

  // Baris yang lagi diedit -- form di atas dipakai ulang buat edit
  // (platform-nya TETAP, cuma external_item_id yang bisa diganti),
  // bukan bikin form/modal kedua.
  const [editingMapping, setEditingMapping] = useState<ProductMapping | null>(null)

  useEffect(() => {
    Promise.all([fetchProductMappings(product.id), fetchPlatforms()])
      .then(([mappingList, platformList]) => {
        setMappings(mappingList)
        // Platform yang belum pernah connect (id null, mis. Tokopedia yang
        // belum di-setup) gak bisa dipakai bikin mapping -- butuh platform_id asli.
        setPlatforms(platformList.filter((p): p is Platform & { id: string } => p.id !== null))
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat mapping produk.')
      })
      .finally(() => setIsLoading(false))
  }, [product.id])

  function resetForm() {
    setSelectedPlatformId('')
    setExternalItemId('')
    setFormError(null)
    setPendingReassign(false)
    setEditingMapping(null)
  }

  function startEdit(mapping: ProductMapping) {
    setEditingMapping(mapping)
    setSelectedPlatformId(mapping.platform_id)
    setExternalItemId(mapping.external_item_id)
    setFormError(null)
    setPendingReassign(false)
  }

  async function handleSave(reassign = false) {
    if (!selectedPlatformId) {
      setFormError('Pilih platform dulu.')
      return
    }
    if (!externalItemId.trim()) {
      setFormError('External Product ID wajib diisi.')
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      if (editingMapping) {
        const updated = await updateProductMapping(product.id, editingMapping.id, {
          external_item_id: externalItemId.trim(),
        })
        setMappings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      } else {
        const created = await createProductMapping(product.id, {
          platform_id: selectedPlatformId,
          external_item_id: externalItemId.trim(),
          reassign,
        })
        setMappings((prev) => {
          // reassign=true bisa balas baris yang SAMA id-nya (mapping
          // dipindah dari produk lain) -- kalau kebetulan sudah ada di
          // state ini (harusnya tidak, tapi jaga-jaga), replace bukan dobel.
          const tanpaDuplikat = prev.filter((m) => m.id !== created.id)
          return [...tanpaDuplikat, created]
        })
      }
      resetForm()
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && !editingMapping) {
        // Task 10B Phase 12 -- JANGAN overwrite diam-diam. Tampilkan pesan
        // dari backend (sudah menyebut nama produk yang sekarang memegang
        // mapping ini) + tombol konfirmasi "Pindahkan", bukan retry otomatis.
        setFormError(err.message)
        setPendingReassign(true)
      } else {
        setFormError(err instanceof ApiRequestError ? err.message : 'Gagal menyimpan mapping.')
        setPendingReassign(false)
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove(mapping: ProductMapping) {
    try {
      await deleteProductMapping(product.id, mapping.id)
      setMappings((prev) => prev.filter((m) => m.id !== mapping.id))
      if (editingMapping?.id === mapping.id) resetForm()
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Gagal menghapus mapping.')
    }
  }

  return (
    <Modal className="max-w-md" labelledBy="marketplace-mapping-title">
      <div className="flex flex-col gap-4">
        <h2 id="marketplace-mapping-title" className="text-base font-semibold text-slate-900">
          Marketplace Mapping:
          <br />
          <span className="font-bold text-brand-600">{product.name}</span>
        </h2>

        {isLoading ? (
          <LoadingState />
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {editingMapping ? 'Edit Mapping' : 'Add Mapping'}
              </p>
              <Select
                id="mapping-platform"
                label="Platform"
                value={selectedPlatformId}
                onChange={(event) => setSelectedPlatformId(event.target.value)}
                disabled={Boolean(editingMapping)}
              >
                <option value="">Pilih platform...</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id ?? ''}>
                    {p.platform_name}
                  </option>
                ))}
              </Select>
              <TextInput
                id="mapping-external-id"
                label="External Product ID"
                value={externalItemId}
                onChange={(event) => setExternalItemId(event.target.value)}
                placeholder="mis. 1"
              />
              {formError && (
                <div>
                  <p className="text-sm text-red-600">{formError}</p>
                  {pendingReassign && (
                    <div className="mt-2 flex gap-2">
                      <Button variant="secondary" className="flex-1" onClick={resetForm} disabled={isSaving}>
                        Batal
                      </Button>
                      <Button className="flex-1" isLoading={isSaving} onClick={() => handleSave(true)}>
                        Pindahkan
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!pendingReassign && (
                <div className="flex gap-2">
                  {editingMapping && (
                    <Button variant="secondary" className="flex-1" onClick={resetForm} disabled={isSaving}>
                      Batal Edit
                    </Button>
                  )}
                  <Button className="flex-1" isLoading={isSaving} onClick={() => handleSave(false)}>
                    {editingMapping ? 'Update Mapping' : 'Save Mapping'}
                  </Button>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Current Mappings</p>
              {mappings.length === 0 ? (
                <p className="text-sm text-slate-400">Belum ada mapping marketplace untuk produk ini.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mappings.map((mapping) => (
                    <li
                      key={mapping.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium capitalize text-slate-900">{mapping.platform_name}</p>
                        <p className="truncate text-xs text-slate-500">External ID: {mapping.external_item_id}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title="Edit mapping"
                          aria-label="Edit mapping"
                          onClick={() => startEdit(mapping)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200"
                        >
                          <FiEdit2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Hapus mapping"
                          aria-label="Hapus mapping"
                          onClick={() => handleRemove(mapping)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                        >
                          <FiTrash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <Button variant="secondary" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </Modal>
  )
}
