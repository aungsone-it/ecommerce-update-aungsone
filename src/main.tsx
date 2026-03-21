import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import './styles/index.css'
import { ErrorBoundary } from './app/components/ErrorBoundary'

// Cache bust: 20260307181500
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)