import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './shell/auth/AuthProvider'
import { initOutboxSync } from './shell/offline/outbox'
import { router } from './shell/routing/router'

function App() {
  // Nyala sekali buat sisa umur aplikasi (Fase 4: Offline-Sync
  // Engine) -- bukan per-halaman, biar antrian tetap ke-sync di
  // background walau kasir lagi di halaman lain.
  useEffect(() => initOutboxSync(), [])

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
