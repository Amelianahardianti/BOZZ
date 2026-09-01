import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Kita gak pakai vitest globals (import eksplisit di tiap test), jadi
// auto-cleanup bawaan @testing-library/react (yang ngandelin `afterEach`
// global) gak kepanggil otomatis -- didaftarkan manual di sini biar DOM
// ke-unmount antar test, gak numpuk/ganggu test berikutnya.
afterEach(() => {
  cleanup()
})
