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

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './components/MainLayout'
import { LanguageProvider } from './i18n/LanguageContext'
import { PreLoader } from './components/PreLoader'

// Lazy load all page components for route-based code-splitting
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Factory = lazy(() => import('./pages/Factory'))
const AgentDetail = lazy(() => import('./pages/AgentDetail'))
const AgentChat = lazy(() => import('./pages/AgentChat'))
const AgentPreview = lazy(() => import('./pages/AgentPreview'))
const Settings = lazy(() => import('./pages/Settings'))
const KeyVault = lazy(() => import('./pages/KeyVault'))
const ModelHub = lazy(() => import('./pages/ModelHub'))
const DevLoopDashboard = lazy(() => import('./pages/DevLoopDashboard'))
const MoneyAgent = lazy(() => import('./pages/MoneyAgent'))
const ShopifyFactory = lazy(() => import('./pages/ShopifyFactory'))
const EvolutionRegistry = lazy(() => import('./pages/EvolutionRegistry'))

// Simple loading fallback
const PageLoader = () => <div className="flex items-center justify-center h-screen"><div className="text-xl text-[#475569]">Loading...</div></div>

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <PreLoader>
          <Routes>
              {/* Main Layout containing Sidebar + Content */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
                <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
                <Route path="/factory" element={<Suspense fallback={<PageLoader />}><Factory /></Suspense>} />

                <Route path="/dev-loop" element={<Suspense fallback={<PageLoader />}><DevLoopDashboard /></Suspense>} />
                <Route path="/devloop" element={<Suspense fallback={<PageLoader />}><DevLoopDashboard /></Suspense>} />

                <Route path="/money-agent" element={<Suspense fallback={<PageLoader />}><MoneyAgent /></Suspense>} />
                <Route path="/money" element={<Suspense fallback={<PageLoader />}><MoneyAgent /></Suspense>} />

                <Route path="/shopify" element={<Suspense fallback={<PageLoader />}><ShopifyFactory /></Suspense>} />

                <Route path="/evolution" element={<Suspense fallback={<PageLoader />}><EvolutionRegistry /></Suspense>} />

                {/* Support both new /agents/:id and legacy /agent/:agentId routes */}
                <Route path="/agents/:agentId" element={<Suspense fallback={<PageLoader />}><AgentDetail /></Suspense>} />
                <Route path="/agent/:agentId" element={<Suspense fallback={<PageLoader />}><AgentDetail /></Suspense>} />

                <Route path="/agents/:agentId/chat" element={<Suspense fallback={<PageLoader />}><AgentChat /></Suspense>} />
                <Route path="/agent/:agentId/chat" element={<Suspense fallback={<PageLoader />}><AgentChat /></Suspense>} />

                <Route path="/agent/:agentId/preview" element={<Suspense fallback={<PageLoader />}><AgentPreview /></Suspense>} />

                <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
                <Route path="/settings/keys" element={<Suspense fallback={<PageLoader />}><KeyVault /></Suspense>} />

                {/* Support both /models and /hub */}
                <Route path="/models" element={<Suspense fallback={<PageLoader />}><ModelHub /></Suspense>} />
                <Route path="/hub" element={<Suspense fallback={<PageLoader />}><ModelHub /></Suspense>} />
                <Route path="/vault" element={<Suspense fallback={<PageLoader />}><KeyVault /></Suspense>} />
              </Route>
          </Routes>
        </PreLoader>
      </BrowserRouter>
    </LanguageProvider>
  )
}
