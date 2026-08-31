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

export interface StoreSettings {
  id: string;
  business_name: string;
  address: string | null;
  phone: string | null;
  receipt_footer_note: string | null;
  logo_url: string | null;
  updated_by: string | null;
  updated_at: string;
}

// Tabel ini didesain cuma punya 1 baris (profil toko tunggal). Ambil
// baris paling lama kalau ada, biar konsisten walau suatu saat ada
// baris nyasar lebih dari satu.
export async function getStoreSettings(): Promise<StoreSettings | null> {
  const result = await pool.query<StoreSettings>(
    'SELECT * FROM store_settings ORDER BY updated_at ASC LIMIT 1'
  );
  return result.rows[0] ?? null;
}

export async function createStoreSettings(input: {
  business_name: string;
  address?: string | null;
  phone?: string | null;
  receipt_footer_note?: string | null;
  logo_url?: string | null;
  updated_by?: string | null;
}): Promise<StoreSettings> {
  const result = await pool.query<StoreSettings>(
    `INSERT INTO store_settings (business_name, address, phone, receipt_footer_note, logo_url, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.business_name,
      input.address ?? null,
      input.phone ?? null,
      input.receipt_footer_note ?? null,
      input.logo_url ?? null,
      input.updated_by,
    ]
  );
  return result.rows[0];
}

export async function updateStoreSettings(
  id: string,
  changes: Partial<Pick<StoreSettings, 'business_name' | 'address' | 'phone' | 'receipt_footer_note' | 'logo_url'>>,
  updatedBy: string
): Promise<StoreSettings | null> {
  const fields = Object.keys(changes) as (keyof typeof changes)[];
  if (fields.length === 0) {
    return getStoreSettings();
  }

  const setClauses = fields.map((field, i) => `${field} = $${i + 1}`);
  const values = fields.map((field) => changes[field]);

  const result = await pool.query<StoreSettings>(
    `UPDATE store_settings
     SET ${setClauses.join(', ')}, updated_by = $${fields.length + 1}, updated_at = now()
     WHERE id = $${fields.length + 2}
     RETURNING *`,
    [...values, updatedBy, id]
  );
  return result.rows[0] ?? null;
}

export type NotificationReferenceType = 'external_order' | 'ticket';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  reference_type: NotificationReferenceType | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export async function listNotificationsByUser(
  userId: string,
  filters: { isRead?: boolean; page: number; limit: number }
): Promise<Notification[]> {
  const conditions = ['user_id = $1'];
  const values: unknown[] = [userId];

  if (filters.isRead !== undefined) {
    conditions.push(`is_read = $${values.length + 1}`);
    values.push(filters.isRead);
  }

  const offset = (filters.page - 1) * filters.limit;
  values.push(filters.limit, offset);

  const result = await pool.query<Notification>(
    `SELECT * FROM notifications
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
}

export async function findNotificationById(id: string): Promise<Notification | null> {
  const result = await pool.query<Notification>('SELECT * FROM notifications WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function markNotificationRead(id: string): Promise<Notification | null> {
  const result = await pool.query<Notification>(
    `UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createNotification(input: {
  user_id: string;
  type: string;
  title: string;
  message?: string | null;
  reference_type?: NotificationReferenceType | null;
  reference_id?: string | null;
}): Promise<Notification> {
  const result = await pool.query<Notification>(
    `INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.user_id,
      input.type,
      input.title,
      input.message ?? null,
      input.reference_type ?? null,
      input.reference_id ?? null,
    ]
  );
  return result.rows[0];
}