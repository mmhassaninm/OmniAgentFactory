import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface KeyDef {
  env_name: string
  provider: string
  label: string
  is_set: boolean
  masked_value: string
  key_hash: string
  status?: 'valid' | 'invalid' | 'unverified'
  status_message?: string
}

interface ProviderHealth {
  provider: string
  status: 'online' | 'offline' | 'unconfigured'
  latency_ms: number
  keys_active: number
  keys_exhausted: number
  last_checked: string
}

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

// Map key definition env_name to its metadata (placeholder, format hint)
const KEY_META: Record<string, { placeholder: string }> = {
  GROQ_KEY_1: { placeholder: "gsk_..." },
  GROQ_KEY_2: { placeholder: "gsk_..." },
  GROQ_KEY_3: { placeholder: "gsk_..." },
  GROQ_KEY_4: { placeholder: "gsk_..." },
  OPENROUTER_KEY_1: { placeholder: "sk-or-..." },
  OPENROUTER_KEY_2: { placeholder: "sk-or-..." },
  OPENROUTER_KEY_3: { placeholder: "sk-or-..." },
  OPENROUTER_KEY_4: { placeholder: "sk-or-..." },
  GEMINI_KEY_1: { placeholder: "AIzaSy..." },
  GEMINI_KEY_2: { placeholder: "AIzaSy..." },
  OPENAI_KEY_1: { placeholder: "sk-proj-..." },
  ANTHROPIC_KEY_1: { placeholder: "sk-ant-..." },
  OLLAMA_BASE_URL: { placeholder: "http://host.docker.internal:11434" },
}

export default function Settings() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // State to hold user-inputted values
  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  
  // State to hold visibility overrides (which passwords are shown)
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})

  // Track how many slots are visible in each section
  const [revealedGroq, setRevealedGroq] = useState(1)
  const [revealedOpenRouter, setRevealedOpenRouter] = useState(1)
  const [revealedOther, setRevealedOther] = useState(1)

  // Success message toast state
  const [toast, setToast] = useState<string | null>(null)

  // Keep track of which keys are currently being validated
  const [validatingKeys, setValidatingKeys] = useState<Record<string, boolean>>({})

  // Load configured keys from MongoDB
  const { data, isLoading } = useQuery({
    queryKey: ['settings-keys'],
    queryFn: () => fetchJson('/api/factory/settings/keys'),
  })

  const saveMut = useMutation({
    mutationFn: (keys: Record<string, string>) =>
      fetchJson('/api/factory/settings/keys', {
        method: 'POST',
        body: JSON.stringify({ keys }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['settings-keys'] })
      qc.invalidateQueries({ queryKey: ['model-health'] })
      qc.invalidateQueries({ queryKey: ['provider-health'] })
      // Clear local changes since we re-fetched
      setKeyValues({})
      
      setToast(`✓ API keys saved and auto-validated successfully!`)
      setTimeout(() => setToast(null), 4000)
    },
    onError: (err: any) => {
      setToast(`✗ Error saving keys: ${err.message}`)
      setTimeout(() => setToast(null), 5000)
    }
  })

  // Load provider health channels
  const { data: healthData, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['provider-health'],
    queryFn: () => fetchJson('/api/factory/settings/provider-health'),
    refetchInterval: 60000, // auto-refresh every 60s
  })

  // Manually trigger Model Router key reload
  const reloadRouterMut = useMutation({
    mutationFn: () => fetchJson('/api/factory/settings/reload-router', { method: 'POST' }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['settings-keys'] })
      qc.invalidateQueries({ queryKey: ['provider-health'] })
      setToast(`✓ Model Router reloaded successfully: ${res.keys_loaded} keys across ${res.providers_active} providers online!`)
      setTimeout(() => setToast(null), 5000)
    },
    onError: (err: any) => {
      setToast(`✗ Reload failed: ${err.message}`)
      setTimeout(() => setToast(null), 5000)
    }
  })

  const keys: KeyDef[] = data?.keys || []

  // Split keys into the three sections requested
  const groqKeys = keys.filter(k => k.env_name.startsWith('GROQ_KEY_'))
  const openRouterKeys = keys.filter(k => k.env_name.startsWith('OPENROUTER_KEY_'))
  const otherKeys = keys.filter(k => 
    k.env_name.startsWith('GEMINI_KEY_') || 
    k.env_name === 'OPENAI_KEY_1' || 
    k.env_name === 'ANTHROPIC_KEY_1' ||
    k.env_name === 'OLLAMA_BASE_URL'
  )

  // Auto-reveal configured slots on initial data load so users see what is active
  useEffect(() => {
    if (keys.length > 0) {
      // For Groq, check configured keys
      const groqSetCount = groqKeys.filter(k => k.is_set).length
      setRevealedGroq(Math.max(1, groqSetCount))

      // For OpenRouter
      const orSetCount = openRouterKeys.filter(k => k.is_set).length
      setRevealedOpenRouter(Math.max(1, orSetCount))

      // For Other
      const otherSetCount = otherKeys.filter(k => k.is_set).length
      setRevealedOther(Math.max(1, otherSetCount))
    }
  }, [data])

  const handleSave = () => {
    // Collect non-empty fields or fields cleared explicitly via state
    saveMut.mutate(keyValues)
  }

  // Trigger manual API key validation
  const handleValidateKey = async (envName: string) => {
    setValidatingKeys(prev => ({ ...prev, [envName]: true }))
    try {
      const typedValue = keyValues[envName]
      const body = typedValue !== undefined ? { api_key: typedValue } : {}

      const res = await fetchJson(`/api/factory/settings/keys/validate/${envName}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.status === 'valid') {
        setToast(`✓ ${res.message || 'Key is valid and working!'}`)
        // If we typed a new key and successfully validated it, the backend automatically saves it
        if (typedValue !== undefined) {
          setKeyValues(prev => {
            const copy = { ...prev }
            delete copy[envName]
            return copy
          })
        }
      } else {
        setToast(`✗ ${res.message || 'Key validation failed'}`)
      }

      // Refresh to reload newly verified status
      qc.invalidateQueries({ queryKey: ['settings-keys'] })
      qc.invalidateQueries({ queryKey: ['model-health'] })
    } catch (err: any) {
      setToast(`✗ Validation error: ${err.message}`)
    } finally {
      setValidatingKeys(prev => ({ ...prev, [envName]: false }))
      setTimeout(() => setToast(null), 5000)
    }
  }

  // Check if any changes have been staged
  const hasChanges = Object.keys(keyValues).length > 0

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070a]">
        <div className="flex flex-col items-center gap-4">
          <div className="text-4xl animate-spin text-accent-primary">⚙</div>
          <p className="text-sm text-text-muted font-mono animate-pulse">Loading secure vault...</p>
        </div>
      </div>
    )
  }

  // Render a beautifully detailed status badge
  const getStatusBadge = (keyDef: KeyDef) => {
    // Show nothing if key is completely unconfigured and no local edit is ongoing
    const currentVal = keyValues[keyDef.env_name]
    if (!keyDef.is_set && currentVal === undefined) return null

    // If locally cleared
    if (currentVal === "") return null

    // If local edit is active and not yet saved/validated, show local draft label
    if (currentVal !== undefined && currentVal !== "") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] text-[#00d4ff] font-semibold px-2 py-0.5 rounded-full bg-cyan-950/20 border border-cyan-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse"></span>
          Draft
        </span>
      )
    }

    const status = keyDef.status || 'unverified'
    const message = keyDef.status_message || ''

    if (status === 'valid') {
      return (
        <span 
          className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-950/20 border border-emerald-500/20 cursor-help"
          title={message || "Key verified and working"}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></span>
          Verified
        </span>
      )
    } else if (status === 'invalid') {
      return (
        <span 
          className="inline-flex items-center gap-1.5 text-[10px] text-rose-400 font-semibold px-2 py-0.5 rounded-full bg-rose-950/30 border border-rose-500/30 cursor-help animate-pulse"
          title={message || "Key rejected by provider"}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></span>
          Failed
        </span>
      )
    } else {
      return (
        <span 
          className="inline-flex items-center gap-1.5 text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded-full bg-amber-950/20 border border-amber-500/20 cursor-help"
          title="Key configured but not verified yet"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]"></span>
          Unverified
        </span>
      )
    }
  }

  // Render a specific key input field row
  const renderKeyField = (keyDef: KeyDef) => {
    const isSet = keyDef.is_set
    const currentVal = keyValues[keyDef.env_name]
    const meta = KEY_META[keyDef.env_name] || { placeholder: "Enter Key..." }
    const isOllamaUrl = keyDef.env_name === 'OLLAMA_BASE_URL'

    // Determine what text/value is actually shown in the input
    let inputValue = ""
    
    if (currentVal !== undefined) {
      // Edited or cleared locally
      inputValue = currentVal
    } else if (isSet) {
      // Saved in DB, show masked value
      inputValue = keyDef.masked_value
    }

    const placeholder = isSet ? keyDef.masked_value : "Not configured"
    const inputType = isOllamaUrl ? 'text' : (showKey[keyDef.env_name] ? 'text' : 'password')

    return (
      <div key={keyDef.env_name} className="relative group/field flex flex-col gap-1.5 p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] hover:border-accent-primary/20 transition-all duration-300">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-text-secondary font-mono tracking-wider flex items-center gap-2">
            {keyDef.label}
            {getStatusBadge(keyDef)}
          </label>
          <span className="text-[10px] text-text-muted/60 select-all font-mono opacity-0 group-hover/field:opacity-100 transition-opacity">
            {keyDef.env_name}
          </span>
        </div>

        <div className="flex gap-2 relative">
          <div className="relative flex-1">
            <input
              type={inputType}
              value={inputValue}
              onChange={(e) => setKeyValues(prev => ({
                ...prev,
                [keyDef.env_name]: e.target.value,
              }))}
              placeholder={placeholder}
              className={`w-full pl-3 pr-10 py-2.5 rounded-lg bg-[#04060b] border border-[#1e293b]
                         text-text-primary text-sm font-mono placeholder:text-text-muted/40
                         focus:outline-none focus:border-accent-primary/40 focus:shadow-[0_0_15px_rgba(0,212,255,0.05)] transition-all`}
            />

            {/* Toggle show/hide button */}
            {!isOllamaUrl && (
              <button
                type="button"
                onClick={() => setShowKey(prev => ({ ...prev, [keyDef.env_name]: !prev[keyDef.env_name] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors text-xs"
                title={showKey[keyDef.env_name] ? "Hide Key" : "Show Key"}
              >
                {showKey[keyDef.env_name] ? '👁️' : '🔒'}
              </button>
            )}
          </div>

          {/* Test/Validate button */}
          <button
            type="button"
            onClick={() => handleValidateKey(keyDef.env_name)}
            disabled={validatingKeys[keyDef.env_name] || !(isSet || (inputValue !== undefined && inputValue !== ""))}
            className={`px-3.5 py-2.5 rounded-lg text-xs font-extrabold shrink-0 flex items-center gap-1.5 border transition-all duration-200 ${
              validatingKeys[keyDef.env_name] || !(isSet || (inputValue !== undefined && inputValue !== ""))
                ? 'bg-slate-900/50 text-slate-600 border-slate-900/80 cursor-not-allowed opacity-40'
                : 'bg-accent-primary/10 hover:bg-accent-primary/25 text-accent-primary border-accent-primary/20 hover:border-accent-primary/45 active:scale-[0.97]'
            }`}
            title="Verify if this key actually works with provider"
          >
            {validatingKeys[keyDef.env_name] ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full border border-accent-primary border-t-transparent animate-spin"></span>
                Checking...
              </>
            ) : (
              <>⚡ Validate</>
            )}
          </button>

          {/* Clear button (X) */}
          {(isSet || inputValue) && (
            <button
              type="button"
              onClick={() => {
                setKeyValues(prev => ({
                  ...prev,
                  [keyDef.env_name]: "", // explicit empty string clears key in backend
                }))
                // Also remove masked flag visually
                keyDef.is_set = false
              }}
              className="px-3 rounded-lg text-xs font-semibold shrink-0 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#f87171] border border-[#ef4444]/20 hover:border-[#ef4444]/40 transition-all flex items-center justify-center"
              title="Delete and clear API key"
            >
              × Clear
            </button>
          )}
        </div>
        
        {/* Format hint helper */}
        <div className="text-[10px] text-text-muted/40 font-mono flex justify-between px-1">
          <span>Expected prefix: {meta.placeholder}</span>
          {isSet && <span className="text-emerald-500/60">Configured securely in database</span>}
        </div>
      </div>
    )
  }

  const renderHealthPanel = () => {
    if (isLoadingHealth) {
      return (
        <div className="p-6 rounded-2xl bg-[#070b13]/60 border border-[#141b2c] flex items-center justify-center gap-3 mb-8">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-accent-primary border-t-transparent animate-spin"></span>
          <span className="text-xs text-text-muted font-mono animate-pulse">Pinging provider channels...</span>
        </div>
      )
    }

    const healthList: ProviderHealth[] = healthData || []

    return (
      <div className="glass-panel border border-[#141b2c] rounded-2xl mb-8 p-6 bg-[#070b13]/60 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary text-xl">
              📡
            </div>
            <div>
              <h2 className="text-base font-bold">Provider Health Channels</h2>
              <p className="text-xs text-text-muted">Real-time status, latency, and key exhaustion statistics (updates every 60s)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => reloadRouterMut.mutate()}
              disabled={reloadRouterMut.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-[#c084fc] border border-[#7c3aed]/20 transition-all flex items-center gap-1.5 active:scale-[0.98]"
              title="Force backend router to reload keys from database"
            >
              🔄 Reload Router
            </button>
            <button
              onClick={() => refetchHealth()}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/20 transition-all flex items-center gap-1.5 active:scale-[0.98]"
            >
              ⚡ Ping Health
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {healthList.map((h) => {
            const isOnline = h.status === 'online'
            const isOffline = h.status === 'offline'
            const isUnconfigured = h.status === 'unconfigured'

            let statusColor = 'text-slate-500 bg-slate-950/40 border-slate-900'
            let dotColor = 'bg-slate-500'
            let glowColor = ''

            if (isOnline) {
              statusColor = 'text-emerald-400 bg-emerald-950/20 border-emerald-500/20'
              dotColor = 'bg-emerald-500 animate-pulse'
              glowColor = 'shadow-[0_0_12px_rgba(16,185,129,0.4)]'
            } else if (isOffline) {
              statusColor = 'text-rose-400 bg-rose-950/30 border-rose-500/20'
              dotColor = 'bg-rose-500'
              glowColor = 'shadow-[0_0_12px_rgba(244,63,94,0.4)]'
            }

            return (
              <div
                key={h.provider}
                className="flex flex-col justify-between p-4 rounded-xl bg-[#090d16]/30 border border-[#141b2c] hover:border-accent-primary/10 hover:bg-[#090d16]/50 transition-all duration-300 group/health"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black capitalize tracking-wide font-mono text-text-primary group-hover/health:text-accent-primary transition-colors">
                      {h.provider}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${dotColor} ${glowColor}`} />
                  </div>

                  <span className={`inline-block text-[9px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-md border ${statusColor}`}>
                    {h.status}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-[#141b2c]/60 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-text-muted">
                    <span>Latency</span>
                    <span className="font-mono text-text-primary font-bold">
                      {isOnline ? `${h.latency_ms}ms` : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-text-muted">
                    <span>Keys</span>
                    <span className="font-mono text-text-primary font-bold">
                      {h.keys_active} <span className="text-text-muted font-normal">/</span> <span className="text-rose-400 font-bold">{h.keys_exhausted}</span>
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#030508] p-4 sm:p-6 lg:p-8 text-text-primary">
      {/* Toast notification banner */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-slide-in shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
          <div className={`px-4 py-3 rounded-xl border font-medium text-sm flex items-center gap-2 ${
            toast.startsWith('✓') 
              ? 'bg-[#064e3b]/90 border-[#059669] text-emerald-300' 
              : 'bg-[#991b1b]/90 border-[#ef4444] text-red-200'
          }`}>
            <span>{toast}</span>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        {/* Navigation header */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span>
          <span>Back to Factory Floor</span>
        </button>

        {/* Hero Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-[#141b2c]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              <span className="gradient-text bg-gradient-to-r from-[#00d4ff] to-[#7c3aed]">Key Settings</span>
            </h1>
            <p className="text-text-muted text-sm mt-1">
              Decentralized credentials stored in MongoDB. Keys remain fully encrypted and are never exposed back to client.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saveMut.isPending || !hasChanges}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all duration-300 shadow-lg ${
              saveMut.isPending
                ? 'bg-[#1e293b] text-text-muted cursor-not-allowed'
                : hasChanges
                ? 'bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-[#030508] hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-bg-panel text-text-muted opacity-40 cursor-not-allowed border border-[#1e293b]'
            }`}
          >
            {saveMut.isPending ? (
              <>
                <span className="inline-block w-4 h-4 rounded-full border-2 border-text-muted border-t-text-primary animate-spin"></span>
                Saving Securely...
              </>
            ) : 'Save All Keys'}
          </button>
        </div>

        {renderHealthPanel()}

        {/* ── SECTION 1: GROQ ── */}
        <div className="glass-panel border border-[#141b2c] rounded-2xl mb-8 p-6 bg-[#070b13]/60 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#f97316]/10 border border-[#f97316]/20 flex items-center justify-center text-[#f97316] text-xl">
                ⚡
              </div>
              <div>
                <h2 className="text-base font-bold">Groq Keys</h2>
                <p className="text-xs text-text-muted">High-performance free tier inference keys</p>
              </div>
            </div>

            {/* Add Key Button */}
            {revealedGroq < groqKeys.length && (
              <button
                type="button"
                onClick={() => setRevealedGroq(prev => Math.min(groqKeys.length, prev + 1))}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f97316]/10 hover:bg-[#f97316]/20 text-[#f97316] border border-[#f97316]/20 transition-all"
              >
                ➕ Add API Key
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groqKeys.slice(0, revealedGroq).map(renderKeyField)}
          </div>
        </div>

        {/* ── SECTION 2: OPENROUTER ── */}
        <div className="glass-panel border border-[#141b2c] rounded-2xl mb-8 p-6 bg-[#070b13]/60 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#3b82f6] text-xl">
                🌐
              </div>
              <div>
                <h2 className="text-base font-bold">OpenRouter Keys</h2>
                <p className="text-xs text-text-muted">Universal multi-model gateway configuration</p>
              </div>
            </div>

            {/* Add Key Button */}
            {revealedOpenRouter < openRouterKeys.length && (
              <button
                type="button"
                onClick={() => setRevealedOpenRouter(prev => Math.min(openRouterKeys.length, prev + 1))}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/20 transition-all"
              >
                ➕ Add API Key
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openRouterKeys.slice(0, revealedOpenRouter).map(renderKeyField)}
          </div>
        </div>

        {/* ── SECTION 3: OTHER PROVIDERS ── */}
        <div className="glass-panel border border-[#141b2c] rounded-2xl p-6 bg-[#070b13]/60 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-center text-[#10b981] text-xl">
                🔮
              </div>
              <div>
                <h2 className="text-base font-bold">Other Providers</h2>
                <p className="text-xs text-text-muted">Google Gemini, OpenAI, Anthropic, and Local models</p>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherKeys.map(renderKeyField)}
          </div>
        </div>

        {/* Bottom notes block */}
        <div className="mt-8 text-center text-xs text-text-muted/60 space-y-1">
          <p>🔒 Credentials are encrypted using AES-GCM-256 and persisted in MongoDB `api_keys` collection.</p>
          <p>The standard local `.env` configuration serves strictly as a dev/fallback environment.</p>
        </div>
      </div>
    </div>
  )
}
