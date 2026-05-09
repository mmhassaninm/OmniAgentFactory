import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLang } from '../i18n/LanguageContext'

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
  GITHUB_TOKEN_1: { placeholder: "ghp_..." },
  GITHUB_TOKEN_2: { placeholder: "ghp_..." },
  HF_KEY_1: { placeholder: "hf_..." },
  HF_KEY_2: { placeholder: "hf_..." },
  GOOGLE_AI_STUDIO_KEY_1: { placeholder: "AIzaSy..." },
  GOOGLE_AI_STUDIO_KEY_2: { placeholder: "AIzaSy..." },
  NVIDIA_NIM_KEY_1: { placeholder: "nvapi-..." },
  CEREBRAS_KEY_1: { placeholder: "csk-..." },
  CLOUDFLARE_ACCOUNT_ID: { placeholder: "Account ID" },
  CLOUDFLARE_KEY_1: { placeholder: "your_api_token|your_account_id" },
  LLAMACLOUD_KEY_1: { placeholder: "llx-..." },
}

export default function Settings() {
  const navigate = useNavigate()
  const { t } = useLang()
  const qc = useQueryClient()

  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [revealedGroq, setRevealedGroq] = useState(1)
  const [revealedOpenRouter, setRevealedOpenRouter] = useState(1)
  const [revealedOther, setRevealedOther] = useState(1)
  const [toast, setToast] = useState<string | null>(null)
  const [validatingKeys, setValidatingKeys] = useState<Record<string, boolean>>({})

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-keys'] })
      qc.invalidateQueries({ queryKey: ['model-health'] })
      qc.invalidateQueries({ queryKey: ['provider-health'] })
      setKeyValues({})
      setToast(`✓ API keys saved and auto-validated successfully!`)
      setTimeout(() => setToast(null), 4000)
    },
    onError: (err: any) => {
      setToast(`✗ Error saving keys: ${err.message}`)
      setTimeout(() => setToast(null), 5000)
    }
  })

  const { data: healthData, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['provider-health'],
    queryFn: () => fetchJson('/api/factory/settings/provider-health'),
    refetchInterval: 60000,
  })

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
  const groqKeys = keys.filter(k => k.env_name.startsWith('GROQ_KEY_'))
  const openRouterKeys = keys.filter(k => k.env_name.startsWith('OPENROUTER_KEY_'))
  const otherKeys = keys.filter(k =>
    k.env_name.startsWith('GEMINI_KEY_') ||
    k.env_name === 'OPENAI_KEY_1' ||
    k.env_name === 'ANTHROPIC_KEY_1' ||
    k.env_name === 'OLLAMA_BASE_URL' ||
    k.env_name.startsWith('GITHUB_TOKEN_') ||
    k.env_name.startsWith('HF_KEY_') ||
    k.env_name.startsWith('GOOGLE_AI_STUDIO_KEY_') ||
    k.env_name.startsWith('NVIDIA_NIM_KEY_') ||
    k.env_name.startsWith('CEREBRAS_KEY_') ||
    k.env_name === 'CLOUDFLARE_ACCOUNT_ID' ||
    k.env_name.startsWith('CLOUDFLARE_KEY_') ||
    k.env_name.startsWith('LLAMACLOUD_KEY_')
  )

  useEffect(() => {
    if (keys.length > 0) {
      const groqSetCount = groqKeys.filter(k => k.is_set).length
      setRevealedGroq(Math.max(1, groqSetCount))
      const orSetCount = openRouterKeys.filter(k => k.is_set).length
      setRevealedOpenRouter(Math.max(1, orSetCount))
      const otherSetCount = otherKeys.filter(k => k.is_set).length
      setRevealedOther(Math.max(1, otherSetCount))
    }
  }, [data])

  const handleSave = () => {
    saveMut.mutate(keyValues)
  }

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
      qc.invalidateQueries({ queryKey: ['settings-keys'] })
      qc.invalidateQueries({ queryKey: ['model-health'] })
    } catch (err: any) {
      setToast(`✗ Validation error: ${err.message}`)
    } finally {
      setValidatingKeys(prev => ({ ...prev, [envName]: false }))
      setTimeout(() => setToast(null), 5000)
    }
  }

  const hasChanges = Object.keys(keyValues).length > 0

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070a]">
        <div className="flex flex-col items-center gap-4">
          <div className="text-4xl animate-spin text-accent-primary">⚙</div>
          <p className="text-sm text-text-muted font-mono animate-pulse">{t('settings.loading_vault')}</p>
        </div>
      </div>
    )
  }

  const getStatusBadge = (keyDef: KeyDef) => {
    const currentVal = keyValues[keyDef.env_name]
    if (!keyDef.is_set && currentVal === undefined) return null
    if (currentVal === "") return null
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
        <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-950/20 border border-emerald-500/20 cursor-help" title={message || "Key verified and working"}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></span>
          Verified
        </span>
      )
    } else if (status === 'invalid') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] text-rose-400 font-semibold px-2 py-0.5 rounded-full bg-rose-950/30 border border-rose-500/30 cursor-help animate-pulse" title={message || "Key rejected by provider"}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></span>
          Failed
        </span>
      )
    } else {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded-full bg-amber-950/20 border border-amber-500/20 cursor-help" title="Key configured but not verified yet">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]"></span>
          Unverified
        </span>
      )
    }
  }

  const renderKeyField = (keyDef: KeyDef) => {
    const isSet = keyDef.is_set
    const currentVal = keyValues[keyDef.env_name]
    const meta = KEY_META[keyDef.env_name] || { placeholder: "Enter Key..." }
    const isOllamaUrl = keyDef.env_name === 'OLLAMA_BASE_URL'
    const isAccountId = keyDef.env_name === 'CLOUDFLARE_ACCOUNT_ID'
    let inputValue = ""
    if (currentVal !== undefined) {
      inputValue = currentVal
    } else if (isSet) {
      inputValue = keyDef.masked_value
    }
    const placeholder = isSet ? keyDef.masked_value : "Not configured"
    const inputType = isOllamaUrl || isAccountId ? 'text' : (showKey[keyDef.env_name] ? 'text' : 'password')

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
              onChange={(e) => setKeyValues(prev => ({ ...prev, [keyDef.env_name]: e.target.value }))}
              placeholder={placeholder}
              className="w-full pl-3 pr-10 py-2.5 rounded-lg bg-[#04060b] border border-[#1e293b] text-text-primary text-sm font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-accent-primary/40 focus:shadow-[0_0_15px_rgba(0,212,255,0.05)] transition-all"
            />
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
                {t('settings.checking')}
              </>
            ) : (
              <>⚡ {t('settings.validate_btn')}</>
            )}
          </button>
          {(isSet || inputValue) && (
            <button
              type="button"
              onClick={() => {
                setKeyValues(prev => ({ ...prev, [keyDef.env_name]: "" }))
                keyDef.is_set = false
              }}
              className="px-3 rounded-lg text-xs font-semibold shrink-0 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#f87171] border border-[#ef4444]/20 hover:border-[#ef4444]/40 transition-all flex items-center justify-center"
              title="Delete and clear API key"
            >
              × {t('settings.clear_btn')}
            </button>
          )}
        </div>
        <div className="text-[10px] text-text-muted/40 font-mono flex justify-between px-1">
          <span>{t('settings.expected_prefix')} {meta.placeholder}</span>
          {isSet && <span className="text-emerald-500/60">{t('settings.saved_db')}</span>}
        </div>
      </div>
    )
  }

  const renderHealthPanel = () => {
    if (isLoadingHealth) {
      return (
        <div className="p-6 rounded-2xl bg-[#070b13]/60 border border-[#141b2c] flex items-center justify-center gap-3 mb-8">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-accent-primary border-t-transparent animate-spin"></span>
          <span className="text-xs text-text-muted font-mono animate-pulse">{t('settings.pinging')}</span>
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
              <h2 className="text-base font-bold">{t('settings.health_channels')}</h2>
              <p className="text-xs text-text-muted">{t('settings.health_desc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => reloadRouterMut.mutate()}
              disabled={reloadRouterMut.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-[#c084fc] border border-[#7c3aed]/20 transition-all flex items-center gap-1.5 active:scale-[0.98]"
              title="Force backend router to reload keys from database"
            >
              🔄 {t('settings.reload_btn')}
            </button>
            <button
              onClick={() => refetchHealth()}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/20 transition-all flex items-center gap-1.5 active:scale-[0.98]"
            >
              ⚡ {t('settings.ping_btn')}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {healthList.map((h) => {
            const isOnline = h.status === 'online'
            const isOffline = h.status === 'offline'
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
              <div key={h.provider} className="flex flex-col justify-between p-4 rounded-xl bg-[#090d16]/30 border border-[#141b2c] hover:border-accent-primary/10 hover:bg-[#090d16]/50 transition-all duration-300 group/health">
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
                    <span>{t('settings.latency')}</span>
                    <span className="font-mono text-text-primary font-bold">
                      {isOnline ? `${h.latency_ms}ms` : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-text-muted">
                    <span>{t('settings.active_keys')}</span>
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
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span>
          <span>{t('settings.back_factory')}</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-[#141b2c]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              <span className="gradient-text bg-gradient-to-r from-[#00d4ff] to-[#7c3aed]">{t('settings.page_title')}</span>
            </h1>
            <p className="text-text-muted text-sm mt-1">
              {t('settings.page_desc')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/settings/keys')}
              className="px-5 py-2.5 rounded-xl font-bold text-sm bg-cyan-500/10 hover:bg-cyan-500/20 text-[#00d4ff] border border-[#00d4ff]/30 shadow-[0_0_15px_rgba(0,212,255,0.05)] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              <span>🔐</span>
              <span>Open Key Vault</span>
            </button>
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
                  {t('settings.saving')}
                </>
              ) : t('settings.save_all')}
            </button>
          </div>
        </div>

        {renderHealthPanel()}

        {/* ── CENTRALIZED CRYPTOGRAPHIC KEY VAULT INTEGRATION ── */}
        <div className="glass-panel border border-[#1e293b] rounded-2xl mb-8 p-6 bg-[#070b13]/60 relative overflow-hidden group hover:border-[#00d4ff]/30 transition-colors duration-300">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#00d4ff]/5 to-transparent blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00d4ff]/10 to-[#7c3aed]/10 border border-[#00d4ff]/20 flex items-center justify-center text-xl text-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.15)] shrink-0">
                🔐
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight text-[#f0f4f8] flex items-center gap-2">
                  Unified Cryptographic Key Vault <span className="text-[10px] text-[#00d4ff] font-bold uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-[#00d4ff]/10 border border-[#00d4ff]/20">Active</span>
                </h2>
                <p className="text-xs text-[#64748b] mt-1 max-w-xl">
                  API credential inputs have been migrated to the secure cryptographic key vault dashboard. Keys are now encrypted symmetrically using AES-256 and are loaded only on-demand by internal runner enclaves.
                </p>
                <div className="flex gap-4 mt-3 text-[11px] text-[#64748b] font-mono">
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Multi-Profile Management</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse"></span> AES-256 Symmetric Encryption</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/settings/keys')}
              className="w-full md:w-auto px-6 py-3 rounded-xl font-black text-xs bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-[#080c14] hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <span>Manage API Keys</span>
              <span>➔</span>
            </button>
          </div>
        </div>

        {/* ── SECTION 5: REVENUE ENGINE ── */}
        <div className="glass-panel border border-[#141b2c] rounded-2xl mb-8 p-6 bg-[#070b13]/60 relative overflow-hidden"
          style={{ border: "0.5px solid #10b98130" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-center text-xl">
              💰
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: "#10b981" }}>{t('revenue.title')}</h2>
              <p className="text-xs text-text-muted">{t('revenue.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                {t('revenue.paypal_label')}
              </label>
              <input
                type="text"
                placeholder={t('revenue.paypal_placeholder')}
                className="w-full px-4 py-2.5 rounded-lg bg-[#04060b] border border-[#1e293b] text-text-primary text-sm font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-[#10b981]/40 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                {t('revenue.price_label')}
              </label>
              <input
                type="number"
                defaultValue={25}
                className="w-32 px-4 py-2.5 rounded-lg bg-[#04060b] border border-[#1e293b] text-text-primary text-sm font-mono focus:outline-none focus:border-[#10b981]/40 transition-all"
              />
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-[#10b981]/5 border border-[#10b981]/20">
              <div>
                <p className="text-xs font-semibold text-[#10b981]">{t('revenue.browser_label')}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{t('revenue.browser_subtitle')}</p>
              </div>
            </div>

            <button
              className="px-5 py-2.5 rounded-xl font-bold text-sm bg-[#10b981] hover:bg-[#059669] text-white transition-all duration-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              {t('revenue.save')}
            </button>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-text-muted/60 space-y-1">
          <p>🔒 {t('settings.encrypted_note')}</p>
          <p>{t('settings.env_note')}</p>
        </div>
      </div>
    </div>
  )
}
