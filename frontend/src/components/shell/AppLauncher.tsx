import React, { useState } from 'react'
import { Search, X } from 'lucide-react'

export interface App {
  id: string
  name: string
  icon: string
  description: string
}

export const APPS: App[] = [
  { id: 'factory', name: 'Factory', icon: '🏭', description: 'Agent Factory' },
  { id: 'agents', name: 'Agents', icon: '🤖', description: 'Agent Dashboard' },
  { id: 'revenue', name: 'Revenue', icon: '💰', description: 'Revenue Dashboard' },
  { id: 'vault', name: 'Vault', icon: '🔑', description: 'Key Vault' },
  { id: 'hub', name: 'Hub', icon: '🌐', description: 'Model Hub' },
  { id: 'files', name: 'Files', icon: '📁', description: 'File Explorer' },
  { id: 'gallery', name: 'Gallery', icon: '🖼️', description: 'Image Gallery' },
  { id: 'player', name: 'Player', icon: '🎵', description: 'Media Player' },
  { id: 'terminal', name: 'Terminal', icon: '💻', description: 'System Terminal' },
  { id: 'settings', name: 'Settings', icon: '⚙️', description: 'Settings' },
  { id: 'analytics', name: 'Analytics', icon: '📊', description: 'Analytics' },
]

interface AppLauncherProps {
  onAppSelect: (appId: string) => void
  isOpen: boolean
  onClose: () => void
}

export const AppLauncher: React.FC<AppLauncherProps> = ({
  onAppSelect,
  isOpen,
  onClose,
}) => {
  const [search, setSearch] = useState('')

  const filteredApps = APPS.filter(
    app =>
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-2xl max-h-96 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">App Launcher</h2>
          <button
            onClick={onClose}
            className="hover:bg-gray-100 p-2 rounded transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* App Grid */}
        <div className="grid grid-cols-4 gap-4 overflow-y-auto flex-1">
          {filteredApps.map(app => (
            <button
              key={app.id}
              onClick={() => {
                onAppSelect(app.id)
                onClose()
              }}
              className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-gray-100 transition group"
            >
              <div className="text-4xl group-hover:scale-110 transition">{app.icon}</div>
              <div className="text-center">
                <div className="font-semibold text-sm">{app.name}</div>
                <div className="text-xs text-gray-500">{app.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
