// Wajib paling atas, sebelum import lain — beberapa modul (shared/db.ts,
// dsb.) membaca process.env.* di top-level module scope, jadi butuh .env
// sudah ke-load sebelum modul itu di-import sama sekali.
import 'dotenv/config';
import { app } from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend jalan di http://localhost:${PORT}`);
});
