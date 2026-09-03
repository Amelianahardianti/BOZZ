import { useEffect, useState } from 'react'
import {
  activateStaff,
  createStaff,
  deactivateStaff,
  fetchStaff,
  updateStaff,
  type Staff,
} from '../api/staff'
import { ApiRequestError } from '../api/client'
import { Button, Card, ConfirmActionModal, EmptyState, PageHeader, TextInput } from '../shell/design-system'

type Role = 'kasir' | 'pengepak'

interface FormState {
  name: string
  email_or_username: string
  password: string
  role: Role
  phone: string
}

const EMPTY_FORM: FormState = { name: '', email_or_username: '', password: '', role: 'kasir', phone: '' }

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [pendingAction, setPendingAction] = useState<{ person: Staff; type: 'activate' | 'deactivate' } | null>(null)
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false)

  async function loadStaff() {
    setIsLoading(true)
    setLoadError(null)
    try {
      setStaff(await fetchStaff())
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat daftar staf.')
    } finally {
      setIsLoading(false)
    }
  }

  // .then/.catch/.finally (bukan async/await langsung) SENGAJA dipakai
  // di sini -- biar gak ada setState yang kepanggil SINKRON di badan
  // efek (react-hooks/set-state-in-effect), beda sama loadStaff() di
  // atas yang dipanggil dari event handler (boleh sinkron di situ).
  useEffect(() => {
    fetchStaff()
      .then(setStaff)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat daftar staf.')
      })
      .finally(() => setIsLoading(false))
  }, [])

  function openCreateForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setView('form')
  }

  function openEditForm(person: Staff) {
    setEditingId(person.id)
    setForm({
      name: person.name,
      email_or_username: person.email_or_username,
      password: '',
      role: person.role === 'owner' ? 'kasir' : person.role,
      phone: person.phone ?? '',
    })
    setFormError(null)
    setView('form')
  }

  async function handleSubmit() {
    setFormError(null)
    setIsSubmitting(true)
    try {
      if (editingId) {
        await updateStaff(editingId, {
          name: form.name,
          email_or_username: form.email_or_username,
          role: form.role,
          phone: form.phone || undefined,
        })
      } else {
        await createStaff({
          name: form.name,
          email_or_username: form.email_or_username,
          password: form.password,
          role: form.role,
          phone: form.phone || undefined,
        })
      }
      setView('list')
      await loadStaff()
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Gagal menyimpan data staf.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleConfirmAction() {
    if (!pendingAction) return
    const { person, type } = pendingAction
    setIsConfirmSubmitting(true)
    try {
      if (type === 'deactivate') {
        await deactivateStaff(person.id)
      } else {
        await activateStaff(person.id)
      }
      setPendingAction(null)
      await loadStaff()
    } catch (err) {
      window.alert(
        err instanceof ApiRequestError
          ? err.message
          : type === 'deactivate'
            ? 'Gagal menonaktifkan staf.'
            : 'Gagal mengaktifkan staf.',
      )
    } finally {
      setIsConfirmSubmitting(false)
    }
  }

  if (view === 'form') {
    return (
      <>
        <PageHeader title={editingId ? 'Edit Staf' : 'Tambah Staf'} />
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
              id="email_or_username"
              label="Username"
              value={form.email_or_username}
              onChange={(event) => setForm({ ...form, email_or_username: event.target.value })}
              required
            />
            {!editingId && (
              <TextInput
                id="password"
                label="Password"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
                minLength={6}
              />
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="role" className="text-sm font-medium text-slate-700">
                Role
              </label>
              <select
                id="role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="kasir">Kasir</option>
                <option value="pengepak">Pengepak</option>
              </select>
            </div>
            <TextInput
              id="phone"
              label="Telepon (opsional)"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />

            {formError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setView('list')}>
                Batal
              </Button>
              <Button className="flex-1" disabled={isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? 'Menyimpan...' : 'Simpan'}
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
        title="Staf"
        description="Kelola akun Kasir & Pengepak (FR-FI-03)."
        actions={<Button onClick={openCreateForm}>Tambah Staf</Button>}
      />

      {isLoading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : loadError ? (
        <EmptyState title="Gagal memuat data" description={loadError} />
      ) : staff.length === 0 ? (
        <EmptyState title="Belum ada staf" description='Klik "Tambah Staf" buat bikin akun Kasir/Pengepak pertama.' />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 font-medium">Nama</th>
                <th className="pb-2 font-medium">Username</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((person) => (
                <tr key={person.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">{person.name}</td>
                  <td className="py-2 text-slate-500">{person.email_or_username}</td>
                  <td className="py-2 capitalize">{person.role}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        person.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {person.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-brand-600 hover:underline"
                        onClick={() => openEditForm(person)}
                      >
                        Edit
                      </button>
                      {person.role === 'owner' ? (
                        // Owner cuma dibuat sekali di awal (seed) & gak
                        // bisa dinonaktifkan lewat sini (backend nolak
                        // 400) -- termasuk nonaktifin akun sendiri, biar
                        // toko gak kehilangan satu-satunya akun yang
                        // bisa ngurus staf.
                        <span className="text-xs text-slate-400">Akun Owner</span>
                      ) : person.is_active ? (
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => setPendingAction({ person, type: 'deactivate' })}
                        >
                          Nonaktifkan
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-green-600 hover:underline"
                          onClick={() => setPendingAction({ person, type: 'activate' })}
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

      {pendingAction && (
        <ConfirmActionModal
          title={pendingAction.type === 'deactivate' ? 'Nonaktifkan Staf' : 'Aktifkan Staf'}
          description={
            pendingAction.type === 'deactivate'
              ? `Akun "${pendingAction.person.name}" gak akan bisa login lagi sampai diaktifkan lagi.`
              : `Akun "${pendingAction.person.name}" akan bisa login lagi seperti biasa.`
          }
          confirmWord={pendingAction.type === 'deactivate' ? 'nonaktifkan' : 'aktifkan'}
          confirmLabel={pendingAction.type === 'deactivate' ? 'Nonaktifkan' : 'Aktifkan'}
          variant={pendingAction.type === 'deactivate' ? 'danger' : 'primary'}
          isSubmitting={isConfirmSubmitting}
          onConfirm={handleConfirmAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  )
}
