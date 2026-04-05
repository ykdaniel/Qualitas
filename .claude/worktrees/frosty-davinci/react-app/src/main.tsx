import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { LanguageProvider } from './context/LanguageContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ErrorBoundary } from './components/Shared/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
)
