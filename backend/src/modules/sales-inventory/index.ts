// Pintu masuk resmi modul 'sales-inventory'.
// Modul LAIN hanya boleh import dari file ini — bukan dari internal/.
export { router } from './routes';

// Side-effect: mendaftarkan subscriber EVENTS.ORDER_RECEIVED (Step 4).
// Diimpor di sini (bukan cuma di routes.ts) supaya subscriber tetap
// terdaftar walau suatu saat modul ini diakses tanpa lewat router-nya.
import './event-subscribers';
