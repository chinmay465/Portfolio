import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/anek-latin/standard.css'
import '@fontsource-variable/anek-devanagari/wght.css'
import './index.css'
import './visuals.css'
import './palette.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
