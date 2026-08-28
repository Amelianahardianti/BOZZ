// backend/src/modules/auth-product/service.ts

// File ini isinya "aturan main" -- cek password bener/salah, siapa
// boleh bikin akun siapa, dll. routes.ts manggil fungsi-fungsi di sini,
// bukan langsung ngurus logic-nya sendiri.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as repo from './repository';
import { Role, User } from './internal/store';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-production';
const JWT_EXPIRES_IN = '8h'; // sesi login berlaku 8 jam, sesuaikan kalau perlu

// Jangan pernah kirim password_hash ke frontend, walaupun udah di-hash.
function toPublicUser(user: User) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash: _password_hash, ...publicUser } = user;
  return publicUser;
}

export async function login(username: string, password: string) {
  const user = await repo.findByUsername(username);

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
  username: string;
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

  const existing = await repo.findByUsername(input.username);
  if (existing) {
    throw { status: 400, code: 'VALIDATION_ERROR', message: 'Username sudah dipakai.' };
  }

  const password_hash = await bcrypt.hash(input.password, 10);

  const newUser = await repo.createUser({
    name: input.name,
    username: input.username,
    password_hash,
    role: input.role,
    phone: input.phone,
    created_by: input.createdByUserId,
  });

  return toPublicUser(newUser);
}

export async function updateStaff(
  id: string,
  changes: { name?: string; username?: string; role?: Role; phone?: string }
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