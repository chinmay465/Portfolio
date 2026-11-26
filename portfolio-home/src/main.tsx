import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import '@fontsource-variable/unbounded'
import '@fontsource-variable/anek-latin/standard.css'
import '@fontsource-variable/anek-devanagari/wght.css'
import './index.css'
import { router } from './router'
import { startVisitorTracking } from './lib/visitor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

// Once per page load, outside React, so route changes never send another visit.
startVisitorTracking()
