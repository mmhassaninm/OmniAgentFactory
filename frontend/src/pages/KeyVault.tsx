import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Key, Shield, Search, Plus, Trash2, Edit, Copy, Eye, EyeOff, Check, 
  Activity, Terminal, Database, RefreshCw, CheckCircle, XCircle, AlertCircle, 
  ChevronRight, ArrowLeft, Cpu, Globe, User, Server, ShieldCheck, HelpCircle
} from 'lucide-react'

interface KeyItem {
  id: string
  provider: string
  name: string
  model: string
  key_value: string // masked in list
  profile: string
  status: 'online' | 'offline' | 'unverified' | 'local'
  status_message?: string
  updated_at?: string
}

interface ActivityLog {
  id: string
  time: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
}

const PROVIDERS = [
  { value: 'groq', label: 'Groq', emoji: '⚡', placeholder: 'gsk_...' },
  { value: 'openrouter', label: 'OpenRouter', emoji: '🌐', placeholder: 'sk-or-...' },
  { value: 'gemini', label: 'Gemini', emoji: '♊', placeholder: 'AIzaSy...' },
  { value: 'cloudflare', label: 'Cloudflare', emoji: '☁️', placeholder: 'api_token|account_id' },
  { value: 'llamacloud', label: 'LlamaCloud', emoji: '🦙', placeholder: 'llx-...' },
  { value: 'cerebras', label: 'Cerebras', emoji: '🧠', placeholder: 'csk-...' },
  { value: 'openai', label: 'OpenAI', emoji: '🤖', placeholder: 'sk-proj-...' },
  { value: 'anthropic', label: 'Anthropic', emoji: '🦉', placeholder: 'sk-ant-...' },
  { value: 'ollama', label: 'Ollama', emoji: '🐳', placeholder: 'localhost:11434' },
]

const COLOR_MAP: Record<string, { color: string, bg: string, border: string }> = {
  blue: { color: '#00d4ff', bg: 'bg-cyan-950/20', border: 'border-cyan-500/30' },
  green: { color: '#10b981', bg: 'bg-emerald-950/20', border: 'border-emerald-500/30' },
  purple: { color: '#8b5cf6', bg: 'bg-purple-950/20', border: 'border-purple-500/30' },
  amber: { color: '#f59e0b', bg: 'bg-amber-950/20', border: 'border-amber-500/30' },
  red: { color: '#ef4444', bg: 'bg-red-950/20', border: 'border-red-500/30' }
}

const getProfileStyle = (colorName: string) => {
  return COLOR_MAP[colorName.toLowerCase()] || COLOR_MAP.blue
}

const getProfileName = (email: string) => {
  if (email.toLowerCase() === 'local runtime') return 'Local Runtime'
  return email.split('@')[0]
}

export default function KeyVault() {
  const navigate = useNavigate()
  
  const [profiles, setProfiles] = useState<any[]>([])
  const [profilesLoading, setProfilesLoading] = useState<boolean>(true)
  const [activeProfile, setActiveProfile] = useState<string>('')
  const [keys, setKeys] = useState<KeyItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'offline' | 'local'>('all')
  
  // Reveal Countdown States
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({})
  const [countdowns, setCountdowns] = useState<Record<string, number>>({})
  
  // Copy checkmark notification state
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)
  
  // Validation status
  const [validatingIds, setValidatingIds] = useState<Record<string, boolean>>({})
  
  // Add/Edit Modal
  const [showModal, setShowModal] = useState<boolean>(false)
  const [editingKey, setEditingKey] = useState<KeyItem | null>(null)
  const [formState, setFormState] = useState({
    provider: 'groq',
    name: '',
    model: 'AUTODETECT',
    key_value: '',
    profile: ''
  })
  const [saving, setSaving] = useState<boolean>(false)
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)

  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false)
  const [profileFormState, setProfileFormState] = useState({
    email: '',
    color: 'purple'
  })
  const [savingProfile, setSavingProfile] = useState<boolean>(false)

  // Session activity log
  const [activities, setActivities] = useState<ActivityLog[]>([
    { id: '1', time: new Date().toLocaleTimeString(), type: 'info', message: 'Secure Key Vault Dashboard initialized.' }
  ])

  const logActivity = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const time = new Date().toLocaleTimeString()
    setActivities(prev => [{ id: Math.random().toString(), time, type, message }, ...prev].slice(0, 40))
  }

  const showToast = (message: string, isError: boolean = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // Fetch profiles from API
  const fetchProfiles = async (selectId?: string) => {
    try {
      setProfilesLoading(true)
      const res = await fetch('/api/settings/profiles')
      if (!res.ok) throw new Error('Failed to fetch profiles')
      const data = await res.json()
      setProfiles(data)
      if (data.length > 0) {
        if (selectId) {
          const matched = data.find((p: any) => p.id === selectId)
          if (matched) setActiveProfile(matched.email)
        } else if (!activeProfile || !data.some((p: any) => p.email === activeProfile)) {
          setActiveProfile(data[0].email)
        }
      }
    } catch (err: any) {
      logActivity(`Error loading profiles: ${err.message}`, 'error')
      showToast('Error loading profiles', true)
    } finally {
      setProfilesLoading(false)
    }
  }

  // Fetch keys from API
  const fetchKeys = async () => {
    if (!activeProfile) return
    try {
      setLoading(true)
      const res = await fetch(`/api/settings/keys?profile=${encodeURIComponent(activeProfile)}`)
      if (!res.ok) throw new Error('Failed to load keys from backend')
      const data = await res.json()
      setKeys(data)
    } catch (err: any) {
      logActivity(`Failed to load keys: ${err.message}`, 'error')
      showToast(err.message || 'Error loading keys', true)
    } finally {
      setLoading(false)
    }
  }

  // Save profile to DB
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailTrim = profileFormState.email.trim()
    if (!emailTrim) return showToast('Please enter an account email', true)
    
    setSavingProfile(true)
    logActivity(`Creating new profile '${emailTrim}'...`, 'info')
    try {
      const res = await fetch('/api/settings/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailTrim,
          color: profileFormState.color
        })
      })
      if (!res.ok) throw new Error('Failed to save profile')
      const data = await res.json()
      logActivity(`Profile '${emailTrim}' successfully created.`, 'success')
      showToast('Profile added successfully!')
      setShowProfileModal(false)
      setProfileFormState({ email: '', color: 'purple' })
      await fetchProfiles(data.profile.id)
    } catch (err: any) {
      logActivity(`Failed to save profile: ${err.message}`, 'error')
      showToast(err.message || 'Error saving profile', true)
    } finally {
      setSavingProfile(false)
    }
  }

  // Delete profile from DB
  const handleDeleteProfile = async (e: React.MouseEvent, profileId: string, email: string) => {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to delete profile "${email}" and all its associated keys?`)) return
    
    logActivity(`Permanently deleting profile '${email}' and cascade-removing all its keys...`, 'warning')
    try {
      const res = await fetch(`/api/settings/profiles/${profileId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete profile')
      const data = await res.json()
      logActivity(`Profile '${email}' deleted. Cascade removed ${data.deleted_keys_count} keys.`, 'success')
      showToast('Profile deleted successfully')
      
      if (activeProfile === email) {
        setActiveProfile('')
      }
      fetchProfiles()
    } catch (err: any) {
      logActivity(`Failed to delete profile: ${err.message}`, 'error')
      showToast('Could not delete profile', true)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  useEffect(() => {
    if (activeProfile) {
      fetchKeys()
    }
  }, [activeProfile])

  // Reveal Key with a 5-second auto-hide countdown
  const handleReveal = async (id: string) => {
    if (countdowns[id] > 0) return // Already running
    
    try {
      logActivity(`Decrypting key ID ${id}...`, 'info')
      const res = await fetch(`/api/settings/keys/${id}/reveal`)
      if (!res.ok) throw new Error('Decryption error')
      const data = await res.json()
      
      setRevealedKeys(prev => ({ ...prev, [id]: data.key_value }))
      setCountdowns(prev => ({ ...prev, [id]: 5 }))
      logActivity(`Key Decrypted. Revealed temporarily on a 5-second countdown.`, 'success')

      const interval = setInterval(() => {
        setCountdowns(prev => {
          const current = prev[id] || 0
          if (current <= 1) {
            clearInterval(interval)
            setRevealedKeys(pk => {
              const copy = { ...pk }
              delete copy[id]
              return copy
            })
            logActivity(`Countdown finished. Key cleared from local memory.`, 'info')
            return { ...prev, [id]: 0 }
          }
          return { ...prev, [id]: current - 1 }
        })
      }, 1000)
    } catch (err: any) {
      logActivity(`Failed to decrypt key: ${err.message}`, 'error')
      showToast('Could not decrypt key', true)
    }
  }

  // Copy Key to Clipboard (forces on-the-fly decryption if currently masked)
  const handleCopy = async (item: KeyItem) => {
    try {
      let rawKey = revealedKeys[item.id]
      if (!rawKey) {
        logActivity(`Decrypting key '${item.name}' for clipboard copy...`, 'info')
        const res = await fetch(`/api/settings/keys/${item.id}/reveal`)
        if (!res.ok) throw new Error('Decryption failed')
        const data = await res.json()
        rawKey = data.key_value
      }
      
      await navigator.clipboard.writeText(rawKey || '')
      setCopiedKeyId(item.id)
      logActivity(`Key for '${item.name}' copied to clipboard.`, 'success')
      showToast('Key copied to clipboard!')
      setTimeout(() => setCopiedKeyId(null), 2500)
    } catch (err: any) {
      logActivity(`Copy failed: ${err.message}`, 'error')
      showToast('Copy failed', true)
    }
  }

  // Validate Key Connectivity to provider
  const handleValidate = async (id: string, name: string) => {
    setValidatingIds(prev => ({ ...prev, [id]: true }))
    logActivity(`Initiating connection test for key '${name}'...`, 'info')
    
    try {
      const res = await fetch(`/api/settings/keys/${id}/validate`, { method: 'POST' })
      if (!res.ok) throw new Error('Validation failed on server')
      const data = await res.json()
      
      if (data.valid) {
        logActivity(`✓ Connectivity SUCCESS for '${name}'! Latency: ${data.latency_ms}ms. Status: ONLINE.`, 'success')
        showToast(`✓ Key is working! (${data.latency_ms}ms)`)
      } else {
        logActivity(`✗ Connectivity FAILED for '${name}': ${data.message || 'Verification rejected'}. Status: OFFLINE.`, 'error')
        showToast(`✗ Key verification failed!`, true)
      }
      fetchKeys() // Refetch lists for updated status badges
    } catch (err: any) {
      logActivity(`Validation error for '${name}': ${err.message}`, 'error')
      showToast('Validation failed', true)
    } finally {
      setValidatingIds(prev => ({ ...prev, [id]: false }))
    }
  }

  // Open modal for editing key
  const handleOpenEdit = (item: KeyItem) => {
    setEditingKey(item)
    setFormState({
      provider: item.provider,
      name: item.name,
      model: item.model,
      key_value: item.key_value, // prefilled masked
      profile: item.profile
    })
    setShowModal(true)
  }

  // Open modal for adding key
  const handleOpenAdd = () => {
    setEditingKey(null)
    setFormState({
      provider: 'groq',
      name: '',
      model: 'AUTODETECT',
      key_value: '',
      profile: activeProfile
    })
    setShowModal(true)
  }

  // Delete key from DB
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete '${name}'?`)) return
    
    logActivity(`Deleting key '${name}' from collection...`, 'warning')
    try {
      const res = await fetch(`/api/settings/keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Deletion failed on server')
      logActivity(`Key '${name}' removed.`, 'success')
      showToast('Key deleted successfully')
      fetchKeys()
    } catch (err: any) {
      logActivity(`Failed to delete '${name}': ${err.message}`, 'error')
      showToast('Could not delete key', true)
    }
  }

  // Form Submission
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formState.name.trim()) return showToast('Please enter a name for the key', true)
    
    setSaving(true)
    const payload = {
      id: editingKey?.id || undefined,
      provider: formState.provider,
      name: formState.name.trim(),
      model: formState.model.trim() || 'AUTODETECT',
      key_value: formState.key_value.trim(),
      profile: activeProfile
    }

    logActivity(`${editingKey ? 'Updating' : 'Creating'} key '${payload.name}'...`, 'info')
    
    try {
      const res = await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save key in DB')
      
      logActivity(`Key '${payload.name}' successfully stored in encrypted MongoDB.`, 'success')
      showToast(`Key saved successfully!`)
      setShowModal(false)
      fetchKeys()
    } catch (err: any) {
      logActivity(`Failed to save: ${err.message}`, 'error')
      showToast(err.message || 'Error saving key', true)
    } finally {
      setSaving(false)
    }
  }

  // Reset/populate seeds
  const handleTriggerSeed = async () => {
    if (!confirm("This will force backend key seeding if database keys are empty. Proceed?")) return
    logActivity("Verifying/populating base profiles and keys on backend...", "info")
    try {
      const res = await fetch('/api/settings/keys')
      if (res.ok) {
        logActivity("Base seeds populated successfully.", "success")
        fetchKeys()
      }
    } catch (err) {
      logActivity("Seed check failed", "error")
    }
  }

  // Filters calculation
  const getProviderEmoji = (provider: string) => {
    return PROVIDERS.find(p => p.value === provider.toLowerCase())?.emoji || '🔐'
  }

  const filteredKeys = keys.filter(k => {
    const query = searchQuery.toLowerCase()
    const matchesSearch = k.name.toLowerCase().includes(query) || 
                          k.provider.toLowerCase().includes(query) || 
                          k.model.toLowerCase().includes(query)
    
    if (statusFilter === 'all') return matchesSearch
    if (statusFilter === 'active') return matchesSearch && k.status === 'online'
    if (statusFilter === 'offline') return matchesSearch && k.status === 'offline'
    if (statusFilter === 'local') return matchesSearch && k.status === 'local'
    return matchesSearch
  })

  // Count stats
  const totalKeysCount = keys.length
  const onlineCount = keys.filter(k => k.status === 'online').length
  const offlineCount = keys.filter(k => k.status === 'offline').length
  const localCount = keys.filter(k => k.status === 'local').length

  const currentProfileFromState = profiles.find(p => p.email === activeProfile)
  const currentProfileObj = currentProfileFromState ? {
    email: currentProfileFromState.email,
    name: getProfileName(currentProfileFromState.email),
    color: getProfileStyle(currentProfileFromState.color).color
  } : undefined

  return (
    <div className="min-h-screen bg-[#080c14] text-[#f0f4f8] font-sans flex flex-col antialiased">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-slide-up shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
          <div className={`px-4 py-3.5 rounded-xl border font-semibold text-sm flex items-center gap-2.5 backdrop-blur-md ${
            toast.isError
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-300'
              : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
          }`}>
            {toast.isError ? <XCircle size={18} /> : <CheckCircle size={18} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Grid Wrapper */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* LEFT SIDEBAR: PROFILE SWITCHER */}
        <aside className="w-full md:w-80 bg-[#0d1117] border-b md:border-b-0 md:border-r border-[#1e293b] p-6 flex flex-col gap-6 shrink-0">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#1e293b]/50">
            <div className="w-10 h-10 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/20 flex items-center justify-center text-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.15)]">
              <ShieldCheck size={22} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight gradient-text">OmniBot</h2>
              <p className="text-xs text-[#64748b] font-semibold uppercase tracking-wider font-mono">Agent Key Vault</p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono px-1">Profiles / Accounts</label>
            <div className="space-y-2">
              {profilesLoading ? (
                <div className="py-6 text-center text-xs font-mono text-[#64748b] animate-pulse">
                  Loading profiles...
                </div>
              ) : profiles.map((p) => {
                const styleObj = getProfileStyle(p.color)
                const isActive = activeProfile === p.email
                const pName = getProfileName(p.email)
                return (
                  <div
                    key={p.id || p.email}
                    onClick={() => setActiveProfile(p.email)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-300 flex items-center justify-between group cursor-pointer ${
                      isActive 
                        ? 'bg-[#111827] border-l-4' 
                        : 'bg-[#0c1017]/40 border-[#1e293b] hover:border-[#1e293b]/80 hover:bg-[#111827]/30'
                    }`}
                    style={{ borderLeftColor: isActive ? styleObj.color : undefined }}
                  >
                    <div className="flex items-center gap-3 overflow-hidden pr-2">
                      <div 
                        className={`w-3 h-3 rounded-full flex-shrink-0 animate-pulse`} 
                        style={{ 
                          backgroundColor: styleObj.color, 
                          boxShadow: isActive ? `0 0 10px ${styleObj.color}` : 'none' 
                        }} 
                      />
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-[#f0f4f8] tracking-tight group-hover:text-[#00d4ff] transition-colors truncate">{pName}</p>
                        <p className="text-xs text-[#64748b] font-mono truncate">{p.email}</p>
                      </div>
                    </div>
                    
                    {/* Action area: Hover Delete + Chevron right */}
                    <div className="flex items-center shrink-0">
                      <button
                        onClick={(e) => handleDeleteProfile(e, p.id, p.email)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[#64748b] hover:text-rose-400 p-1 hover:bg-rose-950/20 rounded mr-1"
                        title={`Delete profile and its keys`}
                      >
                        <Trash2 size={13} />
                      </button>
                      <ChevronRight size={14} className={`text-[#64748b] group-hover:translate-x-1 transition-transform shrink-0 ${isActive ? 'translate-x-0.5' : ''}`} />
                    </div>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() => {
                  setProfileFormState({ email: '', color: 'purple' })
                  setShowProfileModal(true)
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#00d4ff] hover:text-[#080c14] bg-[#00d4ff]/10 hover:bg-[#00d4ff] border border-[#00d4ff]/30 hover:border-[#00d4ff] transition-all flex items-center justify-center gap-2 mt-3"
              >
                <Plus size={14} />
                Add Profile
              </button>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-[#1e293b]/50">
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold text-[#64748b] hover:text-[#00d4ff] bg-[#0c1017] hover:bg-[#111827] border border-[#1e293b] transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} />
              Return to Factory
            </button>
          </div>
        </aside>

        {/* MAIN DISPLAY AREA */}
        <main className="flex-1 p-6 md:p-8 lg:p-10 flex flex-col gap-6 overflow-y-auto max-w-7xl mx-auto w-full">
          {/* PROFILE HEADER & METRICS SUMMARY */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-[#1e293b]/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider font-mono text-[#00d4ff] px-2.5 py-1 rounded bg-[#00d4ff]/10 border border-[#00d4ff]/20">
                  {currentProfileObj?.name || 'Active Profile'}
                </span>
                <span className="text-xs text-[#64748b] font-mono">{activeProfile}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#f0f4f8] mt-1.5 flex items-center gap-2">
                🔒 Cryptographic Vault <span className="text-xs text-[#64748b] font-normal font-mono">(AES-256 Fernet)</span>
              </h1>
              <p className="text-xs text-[#64748b] mt-1">
                API keys are symmetrically encrypted at-rest. Keys are decrypted on-the-fly inside the runtime environment and are never leaked to localStorage.
              </p>
            </div>

            <div className="flex gap-2.5 self-stretch lg:self-auto justify-end">
              <button
                onClick={handleTriggerSeed}
                className="px-3.5 py-2.5 rounded-xl text-xs font-extrabold bg-[#1e293b]/40 hover:bg-[#1e293b]/80 border border-[#1e293b] text-[#64748b] hover:text-[#f0f4f8] flex items-center gap-2 transition-all active:scale-95"
                title="Populate missing seeds inside MongoDB"
              >
                <RefreshCw size={13} />
                Seed keys
              </button>
              <button
                onClick={handleOpenAdd}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-[#080c14] hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
              >
                <Plus size={15} />
                Register New Key
              </button>
            </div>
          </div>

          {/* STATS ROW */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-[#0d1117] border border-[#1e293b] flex items-center justify-between relative overflow-hidden group hover:border-[#00d4ff]/30 transition-colors">
              <div>
                <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono">Total Credentials</p>
                <p className="text-2xl font-black mt-1 font-mono">{totalKeysCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-[#1e293b] flex items-center justify-center text-[#64748b] group-hover:text-[#00d4ff] transition-colors">
                <Database size={18} />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1117] border border-[#1e293b] flex items-center justify-between relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
              <div>
                <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono">Verified Online</p>
                <p className="text-2xl font-black mt-1 text-[#10b981] font-mono">{onlineCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-[#1e293b] flex items-center justify-center text-[#64748b] group-hover:text-[#10b981] transition-colors">
                <CheckCircle size={18} />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1117] border border-[#1e293b] flex items-center justify-between relative overflow-hidden group hover:border-rose-500/30 transition-colors">
              <div>
                <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono">Offline / Failed</p>
                <p className="text-2xl font-black mt-1 text-[#ef4444] font-mono">{offlineCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-[#1e293b] flex items-center justify-center text-[#64748b] group-hover:text-[#ef4444] transition-colors">
                <XCircle size={18} />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d1117] border border-[#1e293b] flex items-center justify-between relative overflow-hidden group hover:border-purple-500/30 transition-colors">
              <div>
                <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono">Local Enclaves</p>
                <p className="text-2xl font-black mt-1 text-[#8b5cf6] font-mono">{localCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-[#1e293b] flex items-center justify-center text-[#64748b] group-hover:text-[#8b5cf6] transition-colors">
                <Cpu size={18} />
              </div>
            </div>
          </div>

          {/* FILTER & SEARCH ROW */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 p-3 bg-[#0d1117] border border-[#1e293b] rounded-2xl">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" size={16} />
              <input
                type="text"
                placeholder="Search credentials by provider, name, or model..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#080c14] border border-[#1e293b] text-sm placeholder:text-[#64748b]/60 focus:outline-none focus:border-[#00d4ff]/40 font-mono"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-1.5 overflow-x-auto shrink-0 bg-[#080c14] p-1.5 rounded-xl border border-[#1e293b]/40">
              {(['all', 'active', 'offline', 'local'] as const).map((filter) => {
                const isActive = statusFilter === filter
                return (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                      isActive 
                        ? 'bg-[#1e293b] text-[#00d4ff]' 
                        : 'text-[#64748b] hover:text-[#f0f4f8]'
                    }`}
                  >
                    {filter}
                  </button>
                )
              })}
            </div>
          </div>

          {/* KEYS GRID CONTAINER */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-[#0d1117] rounded-3xl border border-[#1e293b] gap-3">
              <div className="text-3xl animate-spin text-[#00d4ff]">⚙</div>
              <p className="text-xs font-mono text-[#64748b] animate-pulse">Decrypting and compiling vault indices...</p>
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-[#0d1117]/30 border border-[#1e293b] border-dashed rounded-3xl text-center p-6">
              <div className="w-16 h-16 rounded-full bg-slate-900 border border-[#1e293b] flex items-center justify-center text-3xl mb-4 opacity-40">🔐</div>
              <h3 className="text-base font-black text-[#f0f4f8]">No Keys Configured</h3>
              <p className="text-xs text-[#64748b] mt-1.5 max-w-sm mx-auto">
                No matching credentials were found for this configuration set. Hit "Register New Key" to save your first API key.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredKeys.map((item) => {
                const isRevealed = !!revealedKeys[item.id]
                const countdown = countdowns[item.id] || 0
                const isCopied = copiedKeyId === item.id
                const isValidating = validatingIds[item.id] || false

                // Status Badge styling
                let statusBadgeText = 'UNVERIFIED'
                let statusBadgeStyle = 'text-slate-400 bg-slate-950/40 border-slate-900'
                let dotStyle = 'bg-slate-400'
                
                if (item.status === 'online') {
                  statusBadgeText = 'ONLINE'
                  statusBadgeStyle = 'text-emerald-400 bg-emerald-950/20 border-emerald-500/20'
                  dotStyle = 'bg-emerald-500 animate-pulse'
                } else if (item.status === 'offline') {
                  statusBadgeText = 'OFFLINE'
                  statusBadgeStyle = 'text-rose-400 bg-rose-950/30 border-rose-500/20'
                  dotStyle = 'bg-rose-500 animate-bounce'
                } else if (item.status === 'local') {
                  statusBadgeText = 'LOCAL'
                  statusBadgeStyle = 'text-purple-400 bg-purple-950/20 border-purple-500/20'
                  dotStyle = 'bg-purple-500 animate-pulse'
                }

                return (
                  <div 
                    key={item.id} 
                    className="p-5 rounded-2xl bg-[#0d1117] border border-[#1e293b] hover:border-[#1e293b]*2 transition-all duration-300 relative overflow-hidden group flex flex-col justify-between"
                  >
                    {/* Glow effect */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#00d4ff]/5 to-transparent blur-2xl group-hover:from-[#00d4ff]/10 transition-all pointer-events-none" />

                    <div>
                      {/* CARD HEADER */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="text-2xl w-10 h-10 rounded-xl bg-slate-950/80 border border-[#1e293b] flex items-center justify-center">
                            {getProviderEmoji(item.provider)}
                          </div>
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider font-mono text-[#64748b]">
                              {item.provider}
                            </span>
                            <h4 className="text-sm font-bold text-[#f0f4f8] leading-tight mt-0.5">{item.name}</h4>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className={`inline-flex items-center gap-1.5 text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border ${statusBadgeStyle}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
                          {statusBadgeText}
                        </div>
                      </div>

                      {/* MODEL */}
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono mb-1">Target Engine / Routing Model</p>
                        <div className="px-3 py-2 rounded-lg bg-slate-950 border border-[#1e293b]/40 text-xs font-mono text-[#f0f4f8] flex items-center gap-2">
                          <Cpu size={12} className="text-[#64748b]" />
                          {item.provider.toLowerCase() === 'llamacloud' ? '📄 Document Parser' : item.model}
                        </div>
                      </div>

                      {/* API KEY FIELD */}
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono mb-1">Decrypted Value</p>
                        <div className="relative font-mono text-xs overflow-hidden">
                          <input
                            type="text"
                            readOnly
                            value={isRevealed ? (revealedKeys[item.id] || '') : item.key_value}
                            className={`w-full px-3 py-2.5 rounded-lg bg-slate-950 border text-[11px] placeholder:text-slate-700 focus:outline-none ${
                              isRevealed 
                                ? 'border-[#00d4ff]/40 text-[#00d4ff] font-extrabold glow-primary' 
                                : 'border-[#1e293b]/40 text-[#64748b]/80'
                            }`}
                          />
                          {isRevealed && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[10px] font-black bg-[#080c14] border border-[#00d4ff]/20 text-[#00d4ff] px-2 py-0.5 rounded">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-ping" />
                              Timer {countdown}s
                            </div>
                          )}
                        </div>
                        {/* Countdown progress bar */}
                        {isRevealed && (
                          <div className="w-full bg-slate-950 h-1 mt-1 rounded-full overflow-hidden">
                            <div 
                              className="bg-[#00d4ff] h-full transition-all duration-1000"
                              style={{ width: `${(countdown / 5) * 100}%` }}
                            />
                          </div>
                        )}
                        {item.provider.toLowerCase() === 'llamacloud' && (
                          <div className="text-[9px] text-[#64748b] mt-2 font-mono">
                            Used by agents for PDF/document analysis
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CARD ACTIONS */}
                    <div className="flex items-center gap-1.5 pt-3 border-t border-[#1e293b]/40">
                      {item.provider.toLowerCase() !== 'ollama' && (
                        <button
                          onClick={() => handleReveal(item.id)}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border flex items-center justify-center gap-1.5 transition-all ${
                            isRevealed 
                              ? 'bg-slate-950 border-[#00d4ff]/30 text-[#00d4ff] cursor-default' 
                              : 'bg-slate-950/20 hover:bg-[#111827] border-[#1e293b] text-[#64748b] hover:text-[#f0f4f8]'
                          }`}
                          title="Decrypt and show key value on a timer"
                          disabled={isRevealed}
                        >
                          {isRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                          {isRevealed ? 'Revealed' : 'Reveal'}
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleCopy(item)}
                        className={`p-2 rounded-lg border flex items-center justify-center gap-1 bg-slate-950/20 hover:bg-[#111827] border-[#1e293b] transition-all text-[#64748b] hover:text-[#f0f4f8] ${isCopied ? 'border-emerald-500/30 text-emerald-400 hover:text-emerald-400' : ''}`}
                        title="Copy raw unmasked key value"
                        disabled={isCopied}
                      >
                        {isCopied ? <Check size={12} /> : <Copy size={12} />}
                      </button>

                      <button
                        onClick={() => handleValidate(item.id, item.name)}
                        disabled={isValidating}
                        className={`px-3 py-2 rounded-lg text-[10px] font-extrabold uppercase border tracking-wider flex items-center justify-center gap-1 ${
                          isValidating
                            ? 'bg-slate-900 border-slate-900 text-slate-600 cursor-not-allowed'
                            : 'bg-emerald-950/20 hover:bg-emerald-950/50 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 transition-all'
                        }`}
                        title="Test connectivity to model provider"
                      >
                        {isValidating ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          '⚡ Test'
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-2 rounded-lg border flex items-center justify-center bg-slate-950/20 hover:bg-[#111827] border-[#1e293b] text-[#64748b] hover:text-[#00d4ff] hover:border-[#00d4ff]/30 transition-all"
                        title="Edit API key details"
                      >
                        <Edit size={12} />
                      </button>

                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        className="p-2 rounded-lg border flex items-center justify-center bg-slate-950/20 hover:bg-rose-950/10 border-[#1e293b] hover:border-rose-500/30 text-[#64748b] hover:text-rose-400 transition-all"
                        title="Remove credential"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* SESSION ACTIVITY FEED / RETRO TERMINAL */}
          <section className="bg-[#0c1017] border border-[#1e293b] rounded-2xl p-5 overflow-hidden flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-[#1e293b]/50">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-[#00d4ff]" />
                <h3 className="text-xs font-black uppercase tracking-wider font-mono text-[#f0f4f8]">Session Operation Activity</h3>
              </div>
              <button 
                onClick={() => setActivities([{ id: '1', time: new Date().toLocaleTimeString(), type: 'info', message: 'Terminal log cleared.' }])}
                className="text-[10px] font-mono text-[#64748b] hover:text-[#00d4ff] transition-colors"
              >
                Clear Log
              </button>
            </div>

            <div className="h-32 overflow-y-auto font-mono text-[10px] space-y-2.5 scrollbar-thin scrollbar-thumb-accent">
              {activities.map((act) => {
                let textClass = 'text-slate-400'
                if (act.type === 'success') textClass = 'text-emerald-400'
                if (act.type === 'error') textClass = 'text-rose-400'
                if (act.type === 'warning') textClass = 'text-amber-400'
                
                return (
                  <div key={act.id} className="flex gap-2.5 items-start">
                    <span className="text-[#64748b] shrink-0">[{act.time}]</span>
                    <span className={textClass}>{act.message}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </main>
      </div>

      {/* FLOATING DIALOG: ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-strong rounded-2xl max-w-lg w-full overflow-hidden border border-[#1e293b] animate-slide-up">
            <div className="px-6 py-4.5 border-b border-[#1e293b]/50 bg-[#0d1117] flex justify-between items-center">
              <div>
                <h2 className="text-md font-black tracking-tight gradient-text">
                  {editingKey ? '✏️ Edit Credential Details' : '➕ Register New Credential'}
                </h2>
                <p className="text-[10px] text-[#64748b] mt-0.5 uppercase tracking-wider font-mono">
                  Target Profile: {currentProfileObj?.name}
                </p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="text-[#64748b] hover:text-[#f0f4f8] text-sm font-bold px-2 py-1 bg-slate-900 border border-[#1e293b] rounded-lg transition-colors"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 bg-[#080c14]">
              {/* Provider Field */}
              <div>
                <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono mb-1.5">Credential Provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {PROVIDERS.map((prov) => {
                    const isSelected = formState.provider === prov.value
                    return (
                      <button
                        type="button"
                        key={prov.value}
                        onClick={() => setFormState(prev => ({ ...prev, provider: prov.value, key_value: prov.value === 'ollama' ? '' : prev.key_value }))}
                        className={`p-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          isSelected
                            ? 'bg-[#111827] border-[#00d4ff]/50 text-[#00d4ff] shadow-[0_0_12px_rgba(0,212,255,0.1)]'
                            : 'bg-[#0c1017]/50 border-[#1e293b] text-[#64748b] hover:border-[#1e293b]*2'
                        }`}
                      >
                        <span>{prov.emoji}</span>
                        <span>{prov.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Name Field */}
              <div>
                <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono mb-1.5">Key Label / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. mmh_groq_production, cloudflare_token_oaf"
                  value={formState.name}
                  onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#0c1017] border border-[#1e293b] text-sm text-[#f0f4f8] placeholder:text-slate-700 focus:outline-none focus:border-[#00d4ff]/40 font-mono"
                />
              </div>

              {/* Routing Model / Endpoint */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono">
                    {formState.provider === 'ollama' ? 'Ollama Host Address' : 'Model Override / Enclave Routing'}
                  </label>
                  <span className="text-[9px] text-[#64748b] font-mono">Optional</span>
                </div>
                <input
                  type="text"
                  placeholder={formState.provider === 'ollama' ? 'http://localhost:11434' : 'AUTODETECT'}
                  value={formState.model}
                  onChange={(e) => setFormState(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#0c1017] border border-[#1e293b] text-sm text-[#f0f4f8] placeholder:text-slate-700 focus:outline-none focus:border-[#00d4ff]/40 font-mono"
                />
              </div>

              {/* API Key value */}
              {formState.provider !== 'ollama' && formState.provider !== 'cloudflare' && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono">Symmetric Secret Value</label>
                    <span className="text-[9px] text-[#00d4ff] font-mono font-bold">AES encrypted</span>
                  </div>
                  <input
                    type="password"
                    placeholder={
                      editingKey 
                        ? '•••••••• (Leave blank to keep existing key)' 
                        : `Enter your ${formState.provider} API key...`
                    }
                    value={formState.key_value}
                    onChange={(e) => setFormState(prev => ({ ...prev, key_value: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-[#0c1017] border border-[#1e293b] text-sm text-[#f0f4f8] placeholder:text-slate-700 focus:outline-none focus:border-[#00d4ff]/40 font-mono"
                  />
                  <span className="block text-[9px] text-[#64748b] mt-1 font-mono">
                    Expected format: {PROVIDERS.find(p => p.value === formState.provider)?.placeholder}
                  </span>
                </div>
              )}

              {formState.provider === 'cloudflare' && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono">API Token & Account ID</label>
                    <span className="text-[9px] text-[#00d4ff] font-mono font-bold">AES encrypted</span>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="password"
                      placeholder={
                        editingKey 
                          ? '•••••••• (Leave blank to keep existing token)' 
                          : 'API Token (e.g. cfat_xxxxxxxxxxxx)'
                      }
                      value={formState.key_value.split('|')[0] || ''}
                      onChange={(e) => {
                        const account = formState.key_value.split('|')[1] || '';
                        setFormState(prev => ({ ...prev, key_value: `${e.target.value}|${account}` }));
                      }}
                      className="w-full px-4 py-2.5 rounded-lg bg-[#0c1017] border border-[#1e293b] text-sm text-[#f0f4f8] placeholder:text-slate-700 focus:outline-none focus:border-[#00d4ff]/40 font-mono"
                    />
                    <input
                      type="text"
                      placeholder={
                        editingKey 
                          ? '•••••••• (Leave blank to keep existing account ID)' 
                          : 'Account ID (e.g. d75899bffefdbda90a608ab81bd8fb38)'
                      }
                      value={formState.key_value.split('|')[1] || ''}
                      onChange={(e) => {
                        const token = formState.key_value.split('|')[0] || '';
                        setFormState(prev => ({ ...prev, key_value: `${token}|${e.target.value}` }));
                      }}
                      className="w-full px-4 py-2.5 rounded-lg bg-[#0c1017] border border-[#1e293b] text-sm text-[#f0f4f8] placeholder:text-slate-700 focus:outline-none focus:border-[#00d4ff]/40 font-mono"
                    />
                  </div>
                  <span className="block text-[9px] text-[#64748b] mt-2 font-mono">
                    Find your Account ID in Cloudflare Dashboard → right sidebar
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-[#1e293b]/50">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#64748b] hover:text-[#f0f4f8] hover:bg-[#111827] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-extrabold bg-[#00d4ff] hover:bg-[#00b2d6] text-[#080c14] hover:shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border border-[#080c14] border-t-transparent animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Credential'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLOATING DIALOG: ADD PROFILE MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-strong rounded-2xl max-w-md w-full overflow-hidden border border-[#1e293b] animate-slide-up">
            <div className="px-6 py-4.5 border-b border-[#1e293b]/50 bg-[#0d1117] flex justify-between items-center">
              <div>
                <h2 className="text-md font-black tracking-tight gradient-text">👤 Add New Profile</h2>
                <p className="text-[10px] text-[#64748b] mt-0.5 uppercase tracking-wider font-mono">
                  Create a custom user account
                </p>
              </div>
              <button 
                onClick={() => setShowProfileModal(false)}
                className="text-[#64748b] hover:text-[#f0f4f8] text-sm font-bold px-2 py-1 bg-slate-900 border border-[#1e293b] rounded-lg transition-colors"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-5 bg-[#080c14]">
              {/* Account Email Field */}
              <div>
                <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono mb-1.5">Account Email / ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. developer.name@domain.com"
                  value={profileFormState.email}
                  onChange={(e) => setProfileFormState(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#0c1017] border border-[#1e293b] text-sm text-[#f0f4f8] placeholder:text-slate-700 focus:outline-none focus:border-[#00d4ff]/40 font-mono"
                />
              </div>

              {/* Accent Color Swatches */}
              <div>
                <label className="block text-[10px] font-bold text-[#64748b] uppercase tracking-wider font-mono mb-2">Accent Color Theme</label>
                <div className="flex gap-3 justify-between">
                  {Object.keys(COLOR_MAP).map((colorName) => {
                    const style = COLOR_MAP[colorName]
                    const isSelected = profileFormState.color === colorName
                    return (
                      <button
                        type="button"
                        key={colorName}
                        onClick={() => setProfileFormState(prev => ({ ...prev, color: colorName }))}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                          isSelected 
                            ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.25)]' 
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: style.color }}
                        title={colorName.toUpperCase()}
                      >
                        {isSelected && <Check size={14} className="text-[#080c14] font-black" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-[#1e293b]/50">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#64748b] hover:text-[#f0f4f8] hover:bg-[#111827] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2 rounded-xl text-xs font-extrabold bg-[#00d4ff] hover:bg-[#00b2d6] text-[#080c14] hover:shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all flex items-center gap-1.5"
                >
                  {savingProfile ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border border-[#080c14] border-t-transparent animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Create Profile'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
