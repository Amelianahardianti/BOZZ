import { useEffect, useState } from 'react'
import {
  activateStaff,
  createStaff,
  deactivateStaff,
  fetchStaff,
  updateStaff,
  type Staff,
} from '../../api/staff'
import { ApiRequestError } from '../../api/client'
import {
  Button,
  Card,
  ConfirmActionModal,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  TextInput,
} from '../../shell/design-system'

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

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'kasir' | 'pengepak'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const filteredStaff = staff.filter((person) => {
    const query = search.trim().toLowerCase()
    const matchesSearch =
      query === '' ||
      person.name.toLowerCase().includes(query) ||
      person.email_or_username.toLowerCase().includes(query)
    const matchesRole = roleFilter === 'all' || person.role === roleFilter
    const matchesStatus =
      statusFilter === 'all' || (statusFilter === 'active' ? person.is_active : !person.is_active)
    return matchesSearch && matchesRole && matchesStatus
  })

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
            <Select id="role" label="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
              <option value="kasir">Kasir</option>
              <option value="pengepak">Pengepak</option>
            </Select>
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
        title="Staf"
        description="Kelola akun Kasir & Pengepak (FR-FI-03)."
        actions={<Button onClick={openCreateForm}>Tambah Staf</Button>}
      />

      {isLoading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState description={loadError} />
      ) : staff.length === 0 ? (
        <EmptyState title="Belum ada staf" description='Klik "Tambah Staf" buat bikin akun Kasir/Pengepak pertama.' />
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <TextInput
                  id="staff-search"
                  label="Cari"
                  placeholder="Cari nama atau username..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Select id="role-filter" label="Role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}>
                <option value="all">Semua Role</option>
                <option value="owner">Owner</option>
                <option value="kasir">Kasir</option>
                <option value="pengepak">Pengepak</option>
              </Select>
              <Select
                id="status-filter"
                label="Status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </Select>
            </div>
          </Card>

          {filteredStaff.length === 0 ? (
            <EmptyState
              title="Gak ada staf yang cocok"
              description="Coba ubah kata kunci pencarian atau filter role/status-nya."
            />
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
                  {filteredStaff.map((person) => (
                    <tr key={person.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2">{person.name}</td>
                      <td className="py-2 text-slate-500">{person.email_or_username}</td>
                      <td className="py-2 capitalize">{person.role}</td>
                      <td className="py-2">
                        <StatusBadge label={person.is_active ? 'Aktif' : 'Nonaktif'} tone={person.is_active ? 'success' : 'neutral'} />
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
        </>
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
