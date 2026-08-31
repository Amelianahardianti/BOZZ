// backend/src/modules/auth-product/repository.ts

// Semua query pakai parameter binding ($1, $2, dst), BUKAN nyambung
// string manual -- ini wajib buat mencegah SQL Injection (SRS 10.6).

import { pool } from '../../shared/db';

export type Role = 'owner' | 'kasir' | 'pengepak';

export interface User {
  id: string;
  name: string;
  email_or_username: string;
  password_hash: string;
  role: Role;
  phone: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function findByEmailOrUsername(value: string): Promise<User | null> {
  const result = await pool.query<User>(
    'SELECT * FROM users WHERE email_or_username = $1',
    [value]
  );
  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const result = await pool.query<User>('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function listStaff(): Promise<User[]> {
  const result = await pool.query<User>('SELECT * FROM users ORDER BY created_at ASC');
  return result.rows;
}

export async function createUser(input: {
  name: string;
  email_or_username: string;
  password_hash: string;
  role: Role;
  phone?: string | null;
  created_by: string;
}): Promise<User> {
  const result = await pool.query<User>(
    `INSERT INTO users (name, email_or_username, password_hash, role, phone, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.name, input.email_or_username, input.password_hash, input.role, input.phone ?? null, input.created_by]
  );
  return result.rows[0];
}

export async function updateUser(
  id: string,
  changes: Partial<Pick<User, 'name' | 'email_or_username' | 'role' | 'phone'>>
): Promise<User | null> {
  // Bangun query UPDATE secara dinamis, tapi tetap pakai parameter
  // binding ($1, $2, dst) -- BUKAN nempel langsung nilai user ke string.
  const fields = Object.keys(changes) as (keyof typeof changes)[];
  if (fields.length === 0) {
    return findById(id);
  }

  const setClauses = fields.map((field, i) => `${field} = $${i + 1}`);
  const values = fields.map((field) => changes[field]);

  const result = await pool.query<User>(
    `UPDATE users
     SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${fields.length + 1}
     RETURNING *`,
    [...values, id]
  );
  return result.rows[0] ?? null;
}

export async function deactivateUser(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    `UPDATE users SET is_active = false, updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}