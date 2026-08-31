// backend/src/modules/auth-product/index.ts

// Pintu masuk resmi modul 'auth-product'.
// Modul LAIN hanya boleh import dari file ini — bukan dari internal/.
export { router } from './routes';

// Dipanggil langsung (function call, bukan lewat event bus) oleh modul
// lain yang butuh bikin notifikasi -- contoh: Sales & Inventory saat
// assign ticket ke pengepak, Order Hub saat order baru masuk. Lihat
// shared/interfaces/index.ts untuk kontrak tipenya (SRS 9.6).
export { createNotification } from './service';

// Dipakai sales-inventory buat memastikan ticket packing di-assign ke
// Pengepak yang benar-benar ada dan masih aktif.
export { findActiveUser } from './service';
export type { UserSummary } from './service';