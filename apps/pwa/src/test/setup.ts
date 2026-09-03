import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
// jsdom gak punya IndexedDB beneran -- Dexie (shell/offline) butuh
// ini kepasang SEBELUM db.ts di-import mana pun, makanya di setup
// file, bukan di file test masing-masing.
import 'fake-indexeddb/auto'

// Kita gak pakai vitest globals (import eksplisit di tiap test), jadi
// auto-cleanup bawaan @testing-library/react (yang ngandelin `afterEach`
// global) gak kepanggil otomatis -- didaftarkan manual di sini biar DOM
// ke-unmount antar test, gak numpuk/ganggu test berikutnya.
afterEach(() => {
  cleanup()
})
