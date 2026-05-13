import { lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainLayout from './components/MainLayout'
import { LanguageProvider } from './i18n/LanguageContext'
import { PreLoader } from './components/PreLoader'
import GlobalErrorHandler from './components/GlobalErrorHandler'
import ErrorBoundary from './components/ErrorBoundary'
import PageLoader from './components/PageLoader'
import ErrorPage from './pages/errors/ErrorPage'

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
const AgentCollaboration = lazy(() => import('./pages/AgentCollaboration'))
const TaskQueue = lazy(() => import('./pages/TaskQueue'))
const OmniCommander = lazy(() => import('./pages/OmniCommander'))

// Wrapper to add ErrorBoundary + PageLoader around each lazy-loaded page
function PageGuard({ children, pageName }: { children: React.ReactNode; pageName: string }) {
  return (
    <ErrorBoundary pageName={pageName}>
      <PageLoader name={pageName} timeout={10}>
        <>{children}</>
      </PageLoader>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <GlobalErrorHandler>
          <PreLoader>
            <Routes>
              {/* Main Layout containing Sidebar + Content */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<PageGuard pageName="Dashboard"><Dashboard /></PageGuard>} />
                <Route path="/dashboard" element={<PageGuard pageName="Dashboard"><Dashboard /></PageGuard>} />
                <Route path="/factory" element={<PageGuard pageName="Factory"><Factory /></PageGuard>} />

                <Route path="/collaboration" element={<PageGuard pageName="Collaboration"><AgentCollaboration /></PageGuard>} />
                <Route path="/brainstorm" element={<PageGuard pageName="Collaboration"><AgentCollaboration /></PageGuard>} />

                <Route path="/dev-loop" element={<PageGuard pageName="Dev Loop"><DevLoopDashboard /></PageGuard>} />
                <Route path="/devloop" element={<PageGuard pageName="Dev Loop"><DevLoopDashboard /></PageGuard>} />

                <Route path="/money-agent" element={<PageGuard pageName="Money Agent"><MoneyAgent /></PageGuard>} />
                <Route path="/money" element={<PageGuard pageName="Money Agent"><MoneyAgent /></PageGuard>} />

                <Route path="/shopify" element={<PageGuard pageName="Shopify"><ShopifyFactory /></PageGuard>} />

                <Route path="/evolution" element={<PageGuard pageName="Evolution"><EvolutionRegistry /></PageGuard>} />

                <Route path="/queue" element={<PageGuard pageName="Task Queue"><TaskQueue /></PageGuard>} />
                <Route path="/task-queue" element={<PageGuard pageName="Task Queue"><TaskQueue /></PageGuard>} />
                <Route path="/commander" element={<PageGuard pageName="OmniCommander"><OmniCommander /></PageGuard>} />

                {/* Support both new /agents/:id and legacy /agent/:agentId routes */}
                <Route path="/agents/:agentId" element={<PageGuard pageName="Agent Detail"><AgentDetail /></PageGuard>} />
                <Route path="/agent/:agentId" element={<PageGuard pageName="Agent Detail"><AgentDetail /></PageGuard>} />

                <Route path="/agents/:agentId/chat" element={<PageGuard pageName="Agent Chat"><AgentChat /></PageGuard>} />
                <Route path="/agent/:agentId/chat" element={<PageGuard pageName="Agent Chat"><AgentChat /></PageGuard>} />

                <Route path="/agent/:agentId/preview" element={<PageGuard pageName="Agent Preview"><AgentPreview /></PageGuard>} />

                <Route path="/settings" element={<PageGuard pageName="Settings"><Settings /></PageGuard>} />
                <Route path="/settings/keys" element={<PageGuard pageName="Key Vault"><KeyVault /></PageGuard>} />

                {/* Support both /models and /hub */}
                <Route path="/models" element={<PageGuard pageName="Model Hub"><ModelHub /></PageGuard>} />
                <Route path="/hub" element={<PageGuard pageName="Model Hub"><ModelHub /></PageGuard>} />
                <Route path="/vault" element={<PageGuard pageName="Key Vault"><KeyVault /></PageGuard>} />
              </Route>

              {/* Catch-all 404 - MUST be LAST */}
              <Route path="*" element={<ErrorPage code={404} fullPage={true} />} />
            </Routes>
          </PreLoader>
        </GlobalErrorHandler>
      </BrowserRouter>
    </LanguageProvider>
  )
}