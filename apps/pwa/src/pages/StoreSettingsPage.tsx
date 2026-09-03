import { useEffect, useState } from 'react'
import { ApiRequestError } from '../api/client'
import { fetchStoreSettings, updateStoreSettings } from '../api/storeSettings'
import { Button, Card, PageHeader, TextInput } from '../shell/design-system'

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
            <TextInput
              id="logo_url"
              label="URL Logo"
              value={form.logo_url}
              onChange={(event) => setForm({ ...form, logo_url: event.target.value })}
            />

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
