// backend/src/modules/auth-product/service.ts

// File ini isinya "aturan main" -- cek password bener/salah, siapa
// boleh bikin akun siapa, dll. routes.ts manggil fungsi-fungsi di sini,
// bukan langsung ngurus logic-nya sendiri.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as repo from './repository';
import { Role, User } from './repository';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-production';
const JWT_EXPIRES_IN = '8h'; // sesi login berlaku 8 jam, sesuaikan kalau perlu

// Jangan pernah kirim password_hash ke frontend, walaupun udah di-hash.
function toPublicUser(user: User) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash: _password_hash, ...publicUser } = user;
  return publicUser;
}

export async function login(email_or_username: string, password: string) {
  const user = await repo.findByEmailOrUsername(email_or_username);

  if (!user || !user.is_active) {
    throw { status: 401, code: 'INVALID_CREDENTIALS', message: 'Username atau password salah.' };
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw { status: 401, code: 'INVALID_CREDENTIALS', message: 'Username atau password salah.' };
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return { token, user: toPublicUser(user) };
}

export async function getMe(userId: string) {
  const user = await repo.findById(userId);
  if (!user) {
    throw { status: 401, code: 'UNAUTHORIZED', message: 'Akun tidak ditemukan.' };
  }
  return toPublicUser(user);
}

export async function listStaff() {
  const all = await repo.listStaff();
  return all.map(toPublicUser);
}

export async function createStaff(input: {
  name: string;
  email_or_username: string;
  password: string;
  role: Role;
  phone?: string;
  createdByUserId: string;
}) {
  if (input.role === 'owner') {
    // Aturan dari SRS: akun Owner cuma dibikin sekali di awal (seed),
    // bukan lewat form tambah staff.
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Role Owner tidak bisa dibuat lewat endpoint ini.' };
  }

  const existing = await repo.findByEmailOrUsername(input.email_or_username);
  if (existing) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Username sudah dipakai.' };
  }

  const password_hash = await bcrypt.hash(input.password, 10);

  const newUser = await repo.createUser({
    name: input.name,
    email_or_username: input.email_or_username,
    password_hash,
    role: input.role,
    phone: input.phone,
    created_by: input.createdByUserId,
  });

  return toPublicUser(newUser);
}

export async function updateStaff(
  id: string,
  changes: { name?: string; email_or_username?: string; role?: Role; phone?: string }
) {
  const updated = await repo.updateUser(id, changes);
  if (!updated) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Staf tidak ditemukan.' };
  }
  return toPublicUser(updated);
}

export async function deactivateStaff(id: string) {
  const updated = await repo.deactivateUser(id);
  if (!updated) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Staf tidak ditemukan.' };
  }
  return toPublicUser(updated);
}

/**
 * Data akun seperlunya buat dipakai modul lain -- sengaja bukan seluruh
 * User, biar field sensitif (password_hash, dll) tidak ikut menyebar.
 */
export interface UserSummary {
  id: string;
  name: string;
  role: Role;
}

/**
 * Cari akun yang MASIH AKTIF. Diekspor lewat index.ts karena modul lain
 * perlu memastikan sebuah akun benar ada, aktif, dan rolenya sesuai --
 * misalnya sales-inventory yang harus memastikan ticket packing
 * di-assign ke Pengepak, bukan ke kasir atau akun yang sudah nonaktif.
 * Modul yang bertanggung jawab atas data user adalah modul ini, jadi
 * pengecekannya juga tinggal di sini (bukan di sales-inventory).
 *
 * @returns null kalau akunnya tidak ada atau sudah dinonaktifkan.
 */
export async function findActiveUser(id: string): Promise<UserSummary | null> {
  const user = await repo.findById(id);
  if (!user || !user.is_active) return null;
  return { id: user.id, name: user.name, role: user.role };
}

// Tabel store_settings sengaja didesain cuma 1 baris (profil toko
// tunggal), tapi tidak ada endpoint khusus untuk bikin baris pertamanya
// (lihat contracts/api.yaml -- cuma GET & PATCH). Jadi baris default
// dibuat otomatis (lazy) begitu ada yang butuh, baik lewat GET pertama
// kali maupun PATCH pertama kali.
export async function getStoreSettings() {
  const existing = await repo.getStoreSettings();
  if (existing) {
    return existing;
  }
  return repo.createStoreSettings({ business_name: 'Toko Saya' });
}

export async function updateStoreSettings(
  changes: {
    business_name?: string;
    address?: string;
    phone?: string;
    receipt_footer_note?: string;
    logo_url?: string;
  },
  updatedByUserId: string
) {
  const existing = await repo.getStoreSettings();

  if (!existing) {
    return repo.createStoreSettings({
      business_name: changes.business_name ?? 'Toko Saya',
      address: changes.address,
      phone: changes.phone,
      receipt_footer_note: changes.receipt_footer_note,
      logo_url: changes.logo_url,
      updated_by: updatedByUserId,
    });
  }

  const updated = await repo.updateStoreSettings(existing.id, changes, updatedByUserId);
  if (!updated) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Pengaturan toko tidak ditemukan.' };
  }
  return updated;
}

export async function listNotifications(
  userId: string,
  filters: { isRead?: boolean; page: number; limit: number }
) {
  return repo.listNotificationsByUser(userId, filters);
}

export async function markNotificationRead(id: string, userId: string) {
  const existing = await repo.findNotificationById(id);
  // Disamarkan jadi 404 (bukan 403) kalau notifikasi itu bukan
  // punya user yang lagi login -- staf lain tidak perlu tahu notifikasi
  // itu ada sama sekali.
  if (!existing || existing.user_id !== userId) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Notifikasi tidak ditemukan.' };
  }

  const updated = await repo.markNotificationRead(id);
  return updated!;
}

// Dipakai modul lain (Sales & Inventory saat assign ticket, Order Hub
// saat order baru masuk) lewat shared/interfaces -- lihat SRS 9.6.
// Bukan endpoint HTTP, dipanggil langsung sebagai function call.
export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  message?: string;
  referenceType?: 'external_order' | 'ticket';
  referenceId?: string;
}) {
  return repo.createNotification({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    reference_type: input.referenceType,
    reference_id: input.referenceId,
  });
}