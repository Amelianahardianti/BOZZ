import { RouterProvider } from 'react-router-dom'
import { router } from './shell/routing/router'

function App() {
  return <RouterProvider router={router} />
}

export default App
