/*
================================================================================
NEXUSOS / SHELL COMPONENTS REMOVAL LIST (STEP 0 - DEPLOYED)
================================================================================
These files/folders are scheduled for complete deletion to pivot to the standalone Web Dashboard:
- frontend/src/components/shell/AppLauncher.tsx
- frontend/src/components/shell/Desktop.tsx
- frontend/src/components/shell/NotificationToast.tsx
- frontend/src/components/shell/Taskbar.tsx
- frontend/src/components/shell/WindowFrame.tsx
- frontend-nexus/ (entire standalone desktop project folder on port 5174)
================================================================================
*/

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MainLayout from './components/MainLayout'
import Factory from './pages/Factory'
import AgentDetail from './pages/AgentDetail'
import AgentChat from './pages/AgentChat'
import AgentPreview from './pages/AgentPreview'
import Settings from './pages/Settings'
import KeyVault from './pages/KeyVault'
import ModelHub from './pages/ModelHub'
import DevLoopDashboard from './pages/DevLoopDashboard'
import MoneyAgent from './pages/MoneyAgent'
import { LanguageProvider } from './i18n/LanguageContext'
import { PreLoader } from './components/PreLoader'

const queryClient = new QueryClient()

export default function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PreLoader>
            <Routes>
              {/* Main Layout containing Sidebar + Content */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<Navigate to="/factory" replace />} />
                <Route path="/factory" element={<Factory />} />
                
                <Route path="/dev-loop" element={<DevLoopDashboard />} />
                <Route path="/devloop" element={<DevLoopDashboard />} />

                <Route path="/money-agent" element={<MoneyAgent />} />
                <Route path="/money" element={<MoneyAgent />} />
                
                {/* Support both new /agents/:id and legacy /agent/:agentId routes */}
                <Route path="/agents/:agentId" element={<AgentDetail />} />
                <Route path="/agent/:agentId" element={<AgentDetail />} />
                
                <Route path="/agents/:agentId/chat" element={<AgentChat />} />
                <Route path="/agent/:agentId/chat" element={<AgentChat />} />
                
                <Route path="/agent/:agentId/preview" element={<AgentPreview />} />
                
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/keys" element={<KeyVault />} />
                
                {/* Support both /models and /hub */}
                <Route path="/models" element={<ModelHub />} />
                <Route path="/hub" element={<ModelHub />} />
                <Route path="/vault" element={<KeyVault />} />
              </Route>
            </Routes>
          </PreLoader>
        </BrowserRouter>
      </QueryClientProvider>
    </LanguageProvider>
  )
}
