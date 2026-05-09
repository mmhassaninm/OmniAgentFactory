import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Desktop } from './components/shell/Desktop'
import Factory from './pages/Factory'
import AgentDetail from './pages/AgentDetail'
import AgentChat from './pages/AgentChat'
import AgentPreview from './pages/AgentPreview'
import Settings from './pages/Settings'
import KeyVault from './pages/KeyVault'
import ModelHub from './pages/ModelHub'
import { LanguageProvider } from './i18n/LanguageContext'
import { PreLoader } from './components/PreLoader'
import { ToastProvider } from './components/shell/NotificationToast'

const queryClient = new QueryClient()

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <PreLoader>
              <Desktop>
                <div className="min-h-screen bg-bg-base bg-grid">
                  <Routes>
                    <Route path="/" element={<Factory />} />
                    <Route path="/agent/:agentId" element={<AgentDetail />} />
                    <Route path="/agent/:agentId/chat" element={<AgentChat />} />
                    <Route path="/agent/:agentId/preview" element={<AgentPreview />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/settings/keys" element={<KeyVault />} />
                    <Route path="/vault" element={<KeyVault />} />
                    <Route path="/hub" element={<ModelHub />} />
                  </Routes>
                </div>
              </Desktop>
            </PreLoader>
          </BrowserRouter>
        </QueryClientProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}
