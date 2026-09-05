import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiRequestError } from '../../api/client'
import { fetchStoreSettings, updateStoreSettings } from '../../api/storeSettings'
import { compressImageToDataUrl, MAX_LOGO_FILE_BYTES, validateLogoFile } from '../../shared/image'
import { Button, Card, PageHeader, TextInput } from '../../shell/design-system'

interface FormState {
  business_name: string
  address: string
  phone: string
  receipt_footer_note: string
  logo_url: string
}

export function StoreSettingsPage() {
  const [form, setForm] = useState<FormState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [logoError, setLogoError] = useState<string | null>(null)
  const [isProcessingLogo, setIsProcessingLogo] = useState(false)

  useEffect(() => {
    fetchStoreSettings()
      .then((settings) =>
        setForm({
          business_name: settings.business_name,
          address: settings.address ?? '',
          phone: settings.phone ?? '',
          receipt_footer_note: settings.receipt_footer_note ?? '',
          logo_url: settings.logo_url ?? '',
        }),
      )
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat pengaturan toko.')
      })
      .finally(() => setIsLoading(false))
  }, [])

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // biar bisa pilih file yang sama lagi kalau mau ganti ulang
    if (!file || !form) return

    const validationError = validateLogoFile(file)
    if (validationError) {
      setLogoError(validationError)
      return
    }

    setLogoError(null)
    setIsProcessingLogo(true)
    compressImageToDataUrl(file)
      .then((dataUrl) => setForm({ ...form, logo_url: dataUrl }))
      .catch((err: unknown) => {
        setLogoError(err instanceof Error ? err.message : 'Gagal memproses gambar.')
      })
      .finally(() => setIsProcessingLogo(false))
  }

  function handleRemoveLogo() {
    if (!form) return
    setForm({ ...form, logo_url: '' })
    setLogoError(null)
  }

  async function handleSave() {
    if (!form) return
    setSaveError(null)
    setSaved(false)
    setIsSaving(true)
    try {
      await updateStoreSettings(form)
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Gagal menyimpan pengaturan toko.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Pengaturan Toko" description="Nama bisnis, alamat, info yang tampil di struk (FR-FI-04)." />

      {isLoading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : loadError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : form ? (
        <Card className="max-w-md">
          <div className="flex flex-col gap-4">
            <TextInput
              id="business_name"
              label="Nama Bisnis"
              value={form.business_name}
              onChange={(event) => setForm({ ...form, business_name: event.target.value })}
              required
            />
            <TextInput
              id="address"
              label="Alamat"
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
            <TextInput
              id="phone"
              label="Telepon"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
            <TextInput
              id="receipt_footer_note"
              label="Catatan Kaki Struk"
              value={form.receipt_footer_note}
              onChange={(event) => setForm({ ...form, receipt_footer_note: event.target.value })}
              placeholder='mis. "Terima kasih sudah belanja!"'
            />
            <div className="flex flex-col gap-2">
              <label htmlFor="logo_file" className="text-sm font-medium text-slate-700">
                Logo Toko
              </label>

              {form.logo_url && (
                <div className="flex items-center gap-3">
                  <img
                    src={form.logo_url}
                    alt="Logo toko"
                    className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={handleRemoveLogo}
                  >
                    Hapus Logo
                  </button>
                </div>
              )}

              <input
                id="logo_file"
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                onChange={handleLogoChange}
                disabled={isProcessingLogo}
                className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              <p className="text-xs text-slate-400">
                JPG atau PNG, maks {MAX_LOGO_FILE_BYTES / (1024 * 1024)}MB -- otomatis dikecilkan sebelum disimpan.
              </p>
              {isProcessingLogo && <p className="text-xs text-slate-500">Memproses gambar...</p>}
              {logoError && <p className="text-xs text-red-600">{logoError}</p>}
            </div>

            {saveError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveError}
              </p>
            )}
            {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Tersimpan.</p>}

            <Button disabled={isSaving} onClick={handleSave}>
              {isSaving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  )
}
