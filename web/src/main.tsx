import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './styles/tokens.css'
import { dataSource } from './api'
import { FIXTURE_DB_KEY } from './api/fixtures/client'

// No automatic retries: a failing request should surface as an error quickly.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
})

// Keep fan and staff tabs synchronized while sharing the explicit fixture store.
if (dataSource === 'fixtures') {
  window.addEventListener('faze-fixture-update', () => { void queryClient.invalidateQueries() })
  window.addEventListener('storage', event => {
    if (event.key === FIXTURE_DB_KEY || event.key === null) void queryClient.invalidateQueries()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
