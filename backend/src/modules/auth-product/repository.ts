// backend/src/modules/auth-product/repository.ts

// Semua fungsi di sini cuma "ngobrol" sama internal/store.ts.
// service.ts tidak boleh langsung nyentuh internal/store.ts, harus
// lewat fungsi-fungsi yang disediakan di sini. Tujuannya: kalau nanti
// store.ts diganti jadi query database asli, service.ts tidak perlu diubah.

import { users, nextId, User, Role } from './internal/store';

export async function findByUsername(value: string): Promise<User | null> {
  return users.find((u) => u.username === value) ?? null;
}

export async function findById(id: string): Promise<User | null> {
  return users.find((u) => u.id === id) ?? null;
}

export async function listStaff(): Promise<User[]> {
  // Owner biasanya tidak ikut ditampilkan di daftar "staff" biasa,
  // tapi ini disederhanakan dulu -- tampilkan semua.
  return users;
}

export async function createUser(input: {
  name: string;
  username: string;
  password_hash: string;
  role: Role;
  phone?: string | null;
  created_by: string;
}): Promise<User> {
  const now = new Date().toISOString();
  const newUser: User = {
    id: nextId(),
    name: input.name,
    username: input.username,
    password_hash: input.password_hash,
    role: input.role,
    phone: input.phone ?? null,
    is_active: true,
    created_by: input.created_by,
    created_at: now,
    updated_at: now,
  };
  users.push(newUser);
  return newUser;
}

export async function updateUser(
  id: string,
  changes: Partial<Pick<User, 'name' | 'username' | 'role' | 'phone'>>
): Promise<User | null> {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  Object.assign(user, changes, { updated_at: new Date().toISOString() });
  return user;
}

export async function deactivateUser(id: string): Promise<User | null> {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  user.is_active = false;
  user.updated_at = new Date().toISOString();
  return user;
}