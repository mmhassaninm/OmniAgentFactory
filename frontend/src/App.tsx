import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Factory from './pages/Factory'
import AgentDetail from './pages/AgentDetail'
import AgentChat from './pages/AgentChat'
import AgentPreview from './pages/AgentPreview'
import Settings from './pages/Settings'
import KeyVault from './pages/KeyVault'
import { LanguageProvider } from './i18n/LanguageContext'
import { PreLoader } from './components/PreLoader'

const queryClient = new QueryClient()

export default function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PreLoader>
            <div className="min-h-screen bg-bg-base bg-grid">
              <Routes>
                <Route path="/" element={<Factory />} />
                <Route path="/agent/:agentId" element={<AgentDetail />} />
                <Route path="/agent/:agentId/chat" element={<AgentChat />} />
                <Route path="/agent/:agentId/preview" element={<AgentPreview />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/keys" element={<KeyVault />} />
              </Routes>
            </div>
          </PreLoader>
        </BrowserRouter>
      </QueryClientProvider>
    </LanguageProvider>
  )
}
