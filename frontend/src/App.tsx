import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Factory from './pages/Factory'
import AgentDetail from './pages/AgentDetail'
import AgentChat from './pages/AgentChat'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg-base bg-grid">
        <Routes>
          <Route path="/" element={<Factory />} />
          <Route path="/agent/:agentId" element={<AgentDetail />} />
          <Route path="/agent/:agentId/chat" element={<AgentChat />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
