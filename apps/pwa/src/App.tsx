import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './shell/auth/AuthProvider'
import { router } from './shell/routing/router'

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
