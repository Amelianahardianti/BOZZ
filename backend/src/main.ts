import 'dotenv/config';

console.log('DEBUG - DATABASE_URL:', process.env.DATABASE_URL);

import { app } from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend jalan di http://localhost:${PORT}`);
});