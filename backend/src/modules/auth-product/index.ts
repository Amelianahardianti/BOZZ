// backend/src/modules/auth-product/index.ts

// Pintu masuk resmi modul 'auth-product'.
// Modul LAIN hanya boleh import dari file ini — bukan dari internal/.
export { router } from './routes';
// Dipakai sales-inventory buat memastikan ticket packing di-assign ke
// Pengepak yang benar-benar ada dan masih aktif.
export { findActiveUser } from './service';
export type { UserSummary } from './service';
