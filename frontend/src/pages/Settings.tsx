import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLang } from '../i18n/LanguageContext'
import { apiCall, getApiUrl } from '../api'

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

interface ConstitutionRule {
  id: string
  title: string
  rule: string
  immutable: boolean
}

// Use proper API client that routes through backend
async function fetchJson(endpoint: string, options?: RequestInit) {
  return apiCall(endpoint, options)
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

  const [activeTab, setActiveTab] = useState<'general' | 'shopify' | 'evolution'>('general')
  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [revealedGroq, setRevealedGroq] = useState(1)
  const [revealedOpenRouter, setRevealedOpenRouter] = useState(1)
  const [revealedOther, setRevealedOther] = useState(1)
  const [toast, setToast] = useState<string | null>(null)
  const [validatingKeys, setValidatingKeys] = useState<Record<string, boolean>>({})

  // Self-Evolution Settings & Telemetry State
  const [evEnabled, setEvEnabled] = useState(true)
  const [evInterval, setEvInterval] = useState(30)
  const [evMaxPatches, setEvMaxPatches] = useState(5)
  const [evMaxTokens, setEvMaxTokens] = useState(30000)
  const [evRollback, setEvRollback] = useState(true)
  const [ieEnabled, setIeEnabled] = useState(true)
  const [ieRate, setIeRate] = useState(100)
  const [ieMaxDaily, setIeMaxDaily] = useState(2400)
  const [ieScopes, setIeScopes] = useState<string[]>(['everything'])
  const [ieMinScore, setIeMinScore] = useState(5.0)

  // Fetch self-evolution configs
  const { data: evData, isLoading: isLoadingEv } = useQuery({
    queryKey: ['self-evolution-settings'],
    queryFn: () => fetchJson('/api/factory/settings/self-evolution'),
  })

  useEffect(() => {
    if (evData) {
      setEvEnabled(evData.self_evolution_enabled)
      setEvInterval(evData.evolution_interval_minutes)
      setEvMaxPatches(evData.evolution_max_patches_per_cycle)
      setEvMaxTokens(evData.evolution_max_tokens)
      setEvRollback(evData.evolution_rollback_on_failure)
      setIeEnabled(evData.idea_engine_enabled)
      setIeRate(evData.idea_engine_rate_per_hour)
      setIeMaxDaily(evData.idea_engine_max_daily_executions)
      setIeScopes(evData.idea_engine_scopes || ['everything'])
      setIeMinScore(evData.idea_engine_min_score)
    }
  }, [evData])

  // Fetch live self-evolution status / telemetry
  const { data: evStatus, refetch: refetchEvStatus } = useQuery({
    queryKey: ['self-evolution-status'],
    queryFn: () => fetchJson('/api/factory/settings/self-evolution/status'),
    refetchInterval: 30000, // auto-refresh every 30s as requested
  })

  const saveEvMut = useMutation({
    mutationFn: (vals: any) =>
      fetchJson('/api/factory/settings/self-evolution', {
        method: 'POST',
        body: JSON.stringify(vals),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['self-evolution-settings'] })
      qc.invalidateQueries({ queryKey: ['self-evolution-status'] })
      setToast('✓ Self-Evolution configurations saved and applied!')
      setTimeout(() => setToast(null), 4000)
    },
    onError: (err: any) => {
      setToast(`✗ Error saving configurations: ${err.message}`)
      setTimeout(() => setToast(null), 5000)
    }
  })

  // Shopify tab state
  const [shopifyForm, setShopifyForm] = useState({
    store_url: '', admin_token: '', unsplash_access_key: '', swarm_autostart: false, output_folder: '',
  })
  const [showAdminToken, setShowAdminToken] = useState(false)
  const [showUnsplash, setShowUnsplash] = useState(false)
  const [shopifyTestResult, setShopifyTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [shopifySaving, setShopifySaving] = useState(false)
  const [shopifyTesting, setShopifyTesting] = useState(false)

  // Factory Constitution Rules States & Hooks
  const [editedRules, setEditedRules] = useState<ConstitutionRule[]>([])
  const [isEditingConstitution, setIsEditingConstitution] = useState<boolean>(false)

  const { data: constitutionData, isLoading: isLoadingConstitution } = useQuery({
    queryKey: ['constitution-rules'],
    queryFn: () => fetchJson('/api/factory/settings/constitution'),
  })

  useEffect(() => {
    if (constitutionData?.rules) {
      setEditedRules(constitutionData.rules)
    }
  }, [constitutionData])

  const saveConstitutionMut = useMutation({
    mutationFn: (rules: ConstitutionRule[]) =>
      fetchJson('/api/factory/settings/constitution', {
        method: 'POST',
        body: JSON.stringify({ rules }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['constitution-rules'] })
      setToast(`✓ Factory Constitution rules updated successfully!`)
      setTimeout(() => setToast(null), 4000)
      setIsEditingConstitution(false)
    },
    onError: (err: any) => {
      setToast(`✗ Error updating rules: ${err.message}`)
      setTimeout(() => setToast(null), 5000)
    }
  })

  const { data, isLoading, isError: isKeysError } = useQuery({
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

  // General settings state (PayPal link and default service price)
  const [paypalMeLink, setPaypalMeLink] = useState('')
  const [defaultServicePrice, setDefaultServicePrice] = useState(25)

  const { data: generalData, isLoading: isLoadingGeneral } = useQuery({
    queryKey: ['general-settings'],
    queryFn: () => fetchJson('/api/factory/settings/general'),
  })

  useEffect(() => {
    if (generalData) {
      setPaypalMeLink(generalData.paypal_me_link || '')
      setDefaultServicePrice(generalData.default_service_price ?? 25)
    }
  }, [generalData])

  const saveGeneralMut = useMutation({
    mutationFn: (vals: { paypal_me_link: string; default_service_price: number }) =>
      fetchJson('/api/factory/settings/general', {
        method: 'POST',
        body: JSON.stringify(vals),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['general-settings'] })
      setToast('✓ General settings saved successfully!')
      setTimeout(() => setToast(null), 4000)
    },
    onError: (err: any) => {
      setToast(`✗ Error saving general settings: ${err.message}`)
      setTimeout(() => setToast(null), 5000)
    }
  })

  // Load Shopify settings when tab is activated
  useEffect(() => {
    if (activeTab === 'shopify') {
      fetchJson('/api/shopify/settings')
        .then(d => { if (d) setShopifyForm(f => ({ ...f, ...d })) })
        .catch(() => {})
    }
  }, [activeTab])

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#060a12]">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full border-2 border-[#00d4ff] border-t-transparent animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[#f0f4f8] font-mono">{t('settings.loading_vault')}</p>
          <p className="text-xs text-[#64748b] mt-1">Connecting to backend...</p>
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

  const renderConstitutionPanel = () => {
    if (isLoadingConstitution) {
      return (
        <div className="p-6 rounded-2xl bg-[#070b13]/60 border border-[#141b2c] flex items-center justify-center gap-3 mb-8">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-[#00d4ff] border-t-transparent animate-spin"></span>
          <span className="text-xs text-text-muted font-mono animate-pulse">Loading Factory Constitution...</span>
        </div>
      )
    }

    return (
      <div className="glass-panel border border-[#1e293b] rounded-2xl mb-8 p-6 bg-[#070b13]/60 relative overflow-hidden group hover:border-[#7c3aed]/30 transition-all duration-300">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#7c3aed]/5 to-transparent blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#7c3aed]/10 to-indigo-500/10 border border-[#7c3aed]/20 flex items-center justify-center text-xl text-[#a78bfa] shadow-[0_0_15px_rgba(124,58,237,0.15)] shrink-0">
            📜
          </div>
          <div>
            <h2 className="text-base font-black tracking-tight text-[#f0f4f8] flex items-center gap-2">
              Factory Constitution & Policy Engine
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Define the core regulatory guidelines and sandbox parameters prepended as immutable instructions to every agent's DNA and swarm prompts.
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          {editedRules.map((r, idx) => (
            <div
              key={r.id}
              className={`p-4 rounded-xl border transition-all duration-300 ${
                r.immutable
                  ? 'bg-[#090e18]/40 border-[#00d4ff]/20 hover:border-[#00d4ff]/40 shadow-[inset_0_0_12px_rgba(0,212,255,0.02)]'
                  : 'bg-[#090d16]/20 border-[#1e293b] hover:border-[#38bdf8]/20'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-muted select-none">#{idx + 1}</span>
                  {r.immutable ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 flex items-center gap-1 shadow-[0_0_10px_rgba(0,212,255,0.05)]">
                      <span>🔒</span> Sandbox Rule (Immutable)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#7c3aed]/10 text-[#c084fc] border border-[#7c3aed]/20">
                      ⚙️ Policy Directive
                    </span>
                  )}
                </div>
                {!r.immutable && (
                  <button
                    onClick={() => {
                      const updated = editedRules.filter((item) => item.id !== r.id)
                      setEditedRules(updated)
                      setIsEditingConstitution(true)
                    }}
                    className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-90"
                    title="Delete Policy Directive"
                  >
                    🗑️ Delete
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1 font-mono">
                    Rule Title
                  </label>
                  <input
                    type="text"
                    disabled={r.immutable}
                    value={r.title}
                    onChange={(e) => {
                      const updated = editedRules.map((item) =>
                        item.id === r.id ? { ...item, title: e.target.value } : item
                      )
                      setEditedRules(updated)
                      setIsEditingConstitution(true)
                    }}
                    placeholder="Enter rule title..."
                    className="w-full px-3 py-2 rounded-lg text-xs font-bold text-text-primary bg-[#04060b] border border-[#1e293b] focus:outline-none focus:border-[#7c3aed]/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-[#060a10]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1 font-mono">
                    Constitutional Text / Instruction Body
                  </label>
                  <textarea
                    rows={2}
                    disabled={r.immutable}
                    value={r.rule}
                    onChange={(e) => {
                      const updated = editedRules.map((item) =>
                        item.id === r.id ? { ...item, rule: e.target.value } : item
                      )
                      setEditedRules(updated)
                      setIsEditingConstitution(true)
                    }}
                    placeholder="Describe the rule guidelines in detail..."
                    className="w-full px-3 py-2 rounded-lg text-xs text-text-secondary bg-[#04060b] border border-[#1e293b] focus:outline-none focus:border-[#7c3aed]/40 transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-[#060a10]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4 border-t border-[#1e293b]/60">
          <button
            onClick={() => {
              const newRule: ConstitutionRule = {
                id: 'rule_' + Date.now(),
                title: 'New Policy Directive',
                rule: 'This agent must always protect core user metadata, maintaining full local file integrity.',
                immutable: false,
              }
              setEditedRules([...editedRules, newRule])
              setIsEditingConstitution(true)
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-[#c084fc] border border-[#7c3aed]/20 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            ➕ Add Policy Rule
          </button>

          {isEditingConstitution && (
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => {
                  if (constitutionData?.rules) {
                    setEditedRules(constitutionData.rules)
                  }
                  setIsEditingConstitution(false)
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#141b2c] hover:bg-[#1e293b] text-text-secondary transition-all active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={() => saveConstitutionMut.mutate(editedRules)}
                disabled={saveConstitutionMut.isPending}
                className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-[#7c3aed] to-[#00d4ff] text-[#080c14] hover:shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:scale-[1.02] transition-all active:scale-[0.98] flex items-center gap-1.5"
              >
                {saveConstitutionMut.isPending ? 'Saving...' : '💾 Save Constitution'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderShopifyPanel() {
    const field = (
      label: string,
      key: keyof typeof shopifyForm,
      opts?: { type?: string; placeholder?: string; readOnly?: boolean; show?: boolean; onToggle?: () => void }
    ) => (
      <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] hover:border-[#00d4ff]/20 transition-colors flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-[#94a3b8]">{label}</label>
        <div className="flex gap-2">
          <input
            type={opts?.show === false ? 'password' : (opts?.type ?? 'text')}
            readOnly={opts?.readOnly}
            placeholder={opts?.placeholder}
            value={String(shopifyForm[key] ?? '')}
            onChange={e => !opts?.readOnly && setShopifyForm(f => ({ ...f, [key]: e.target.value }))}
            className="flex-1 px-3 py-2.5 rounded-lg bg-[#04060b] border border-[#1e293b] text-[#f0f4f8] text-sm font-mono placeholder:text-[#64748b]/40 focus:outline-none focus:border-[#00d4ff]/40 transition-all read-only:opacity-50"
          />
          {opts?.onToggle && (
            <button
              type="button"
              onClick={opts.onToggle}
              className="px-3 py-2 rounded-lg border border-[#1e293b] text-[#64748b] hover:text-[#f0f4f8] hover:border-[#1e293b] bg-[#090d16] text-sm transition-colors"
            >
              {opts.show === false ? '👁' : '🔒'}
            </button>
          )}
        </div>
      </div>
    )

    return (
      <div className="glass-panel border border-[#141b2c] rounded-2xl p-6 bg-[#070b13]/60 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl">🛍️</div>
          <div>
            <h2 className="text-base font-bold text-[#f0f4f8]">Shopify Integration</h2>
            <p className="text-xs text-[#64748b]">Connect your Shopify store to deploy generated themes directly.</p>
          </div>
        </div>

        {field('Store URL', 'store_url', { placeholder: 'yourstore.myshopify.com' })}
        {field('Admin API Token', 'admin_token', {
          placeholder: 'shpat_...',
          show: showAdminToken ? undefined : false,
          onToggle: () => setShowAdminToken(v => !v),
        })}
        {field('Unsplash Access Key', 'unsplash_access_key', {
          placeholder: 'your unsplash access key',
          show: showUnsplash ? undefined : false,
          onToggle: () => setShowUnsplash(v => !v),
        })}

        {/* Auto-start toggle */}
        <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] hover:border-[#00d4ff]/20 transition-colors flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#94a3b8]">Swarm Auto-Start</p>
            <p className="text-xs text-[#64748b] mt-0.5">Start the theme generation swarm automatically on backend launch.</p>
          </div>
          <button
            type="button"
            onClick={() => setShopifyForm(f => ({ ...f, swarm_autostart: !f.swarm_autostart }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              shopifyForm.swarm_autostart ? 'bg-[#00d4ff]' : 'bg-[#1e293b]'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              shopifyForm.swarm_autostart ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {field('Output Folder', 'output_folder', { readOnly: true, placeholder: 'Loading...' })}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button
            onClick={async () => {
              setShopifySaving(true)
              try {
                const d = await fetchJson('/api/shopify/settings', {
                  method: 'POST',
                  body: JSON.stringify(shopifyForm),
                })
                setToast(d.ok ? '✓ Shopify settings saved!' : '✗ Save failed')
                setTimeout(() => setToast(null), 4000)
              } catch { setToast('✗ Save failed'); setTimeout(() => setToast(null), 4000) }
              setShopifySaving(false)
            }}
            disabled={shopifySaving}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-[#030508] hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {shopifySaving ? 'Saving...' : 'Save Settings'}
          </button>

          <button
            onClick={async () => {
              setShopifyTesting(true)
              setShopifyTestResult(null)
              try {
                const d = await fetchJson('/api/shopify/settings/test', { method: 'POST' })
                setShopifyTestResult({ ok: d.ok, msg: d.ok ? `✓ Connected: ${d.shop_name}` : `✗ ${d.error}` })
              } catch { setShopifyTestResult({ ok: false, msg: '✗ Request failed' }) }
              setShopifyTesting(false)
            }}
            disabled={shopifyTesting}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-all disabled:opacity-50"
          >
            {shopifyTesting ? 'Testing...' : 'Test Connection'}
          </button>

          {shopifyTestResult && (
            <span className={`text-sm font-medium ${shopifyTestResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
              {shopifyTestResult.msg}
            </span>
          )}
        </div>
      </div>
    )
  }

  function renderEvolutionPanel() {
    const formatCountdown = (totalSeconds: number) => {
      if (!totalSeconds || totalSeconds <= 0) return '00:00'
      const mins = Math.floor(totalSeconds / 60)
      const secs = totalSeconds % 60
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const getResultColor = (result: string) => {
      if (result === 'success') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      if (result === 'rolled_back') return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      return 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    }

    const toggleScope = (scope: string) => {
      if (ieScopes.includes(scope)) {
        if (ieScopes.length > 1) {
          setIeScopes(ieScopes.filter(s => s !== scope))
        }
      } else {
        setIeScopes([...ieScopes.filter(s => s !== 'everything'), scope])
      }
    }

    return (
      <div className="space-y-6">
        {/* ── LIVE TELEMETRY DASHBOARD ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass-panel border border-[#1e293b] rounded-2xl p-5 bg-[#070b13]/60 relative overflow-hidden flex flex-col justify-between h-32 hover:border-[#00d4ff]/20 transition-all">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#64748b] tracking-wider uppercase">Scheduler Status</span>
              <span className="text-xl">⏱️</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-2.5 h-2.5 rounded-full ${evStatus?.scheduler_state === 'Running' ? 'bg-emerald-500 animate-pulse' : evStatus?.scheduler_state === 'Idle' ? 'bg-cyan-500' : 'bg-rose-500'} shadow-[0_0_8px_currentColor]`} />
              <span className="text-lg font-black text-[#f0f4f8]">{evStatus?.scheduler_state || 'Loading...'}</span>
            </div>
          </div>

          <div className="glass-panel border border-[#1e293b] rounded-2xl p-5 bg-[#070b13]/60 relative overflow-hidden flex flex-col justify-between h-32 hover:border-[#00d4ff]/20 transition-all">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#64748b] tracking-wider uppercase">Next Cycle Runs In</span>
              <span className="text-xl">⏳</span>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-[#00d4ff] font-mono tracking-widest shadow-[0_0_10px_rgba(0,212,255,0.15)]">
                {evStatus ? formatCountdown(evStatus.next_run_countdown) : '00:00'}
              </span>
            </div>
          </div>

          <div className="glass-panel border border-[#1e293b] rounded-2xl p-5 bg-[#070b13]/60 relative overflow-hidden flex flex-col justify-between h-32 hover:border-[#00d4ff]/20 transition-all">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#64748b] tracking-wider uppercase">Applied Improvements</span>
              <span className="text-xl">✨</span>
            </div>
            <div className="mt-2">
              <span className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-[#00d4ff] bg-clip-text text-transparent">
                {evStatus?.total_improvements ?? 0}
              </span>
            </div>
          </div>

          <div className="glass-panel border border-[#1e293b] rounded-2xl p-5 bg-[#070b13]/60 relative overflow-hidden flex flex-col justify-between h-32 hover:border-[#00d4ff]/20 transition-all">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#64748b] tracking-wider uppercase">Last Cycle Result</span>
              <span className="text-xl">📋</span>
            </div>
            <div className="mt-2 flex">
              <span className={`px-2.5 py-1 text-xs font-black uppercase rounded-lg border tracking-wider ${
                evStatus?.last_result === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]' :
                evStatus?.last_result === 'rolled_back' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                evStatus?.last_result === 'failed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                'bg-bg-panel text-text-muted border-border'
              }`}>
                {evStatus?.last_result ? evStatus.last_result.replace('_', ' ') : 'Never Run'}
              </span>
            </div>
          </div>
        </div>

        {/* ── CONFIGURATION SPLIT VIEW ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Evolution Scheduler Config */}
          <div className="glass-panel border border-[#141b2c] rounded-2xl p-6 bg-[#070b13]/60 relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/20 flex items-center justify-center text-xl">🚀</div>
              <div>
                <h3 className="text-base font-black text-[#f0f4f8]">Self-Evolution Core Scheduler</h3>
                <p className="text-xs text-[#64748b]">Configure how often the codebase self-improves.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] hover:border-[#00d4ff]/20 transition-all flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#94a3b8]">Enable Self-Evolution Loop</p>
                  <p className="text-[10px] text-[#64748b] mt-0.5">Allows the compiler loop to implement backlog improvements.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEvEnabled(!evEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${evEnabled ? 'bg-[#00d4ff]' : 'bg-[#1e293b]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${evEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#94a3b8]">Interval (Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    value={evInterval}
                    onChange={e => setEvInterval(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-lg bg-[#04060b] border border-[#1e293b] text-[#f0f4f8] text-sm font-mono focus:outline-none focus:border-[#00d4ff]/40 transition-all"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#94a3b8]">Max Patches / Cycle</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={evMaxPatches}
                    onChange={e => setEvMaxPatches(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-lg bg-[#04060b] border border-[#1e293b] text-[#f0f4f8] text-sm font-mono focus:outline-none focus:border-[#00d4ff]/40 transition-all"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#94a3b8]">Max Cycle Tokens</label>
                  <input
                    type="number"
                    min="1000"
                    max="200000"
                    value={evMaxTokens}
                    onChange={e => setEvMaxTokens(Math.max(1000, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-lg bg-[#04060b] border border-[#1e293b] text-[#f0f4f8] text-sm font-mono focus:outline-none focus:border-[#00d4ff]/40 transition-all"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] hover:border-[#00d4ff]/20 transition-all flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#94a3b8]">Automatic Rollback on Failures</p>
                  <p className="text-[10px] text-[#64748b] mt-0.5">Undo modifications automatically from local backups if syntax check/tests fail.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEvRollback(!evRollback)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${evRollback ? 'bg-[#00d4ff]' : 'bg-[#1e293b]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${evRollback ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Idea Engine Config */}
          <div className="glass-panel border border-[#141b2c] rounded-2xl p-6 bg-[#070b13]/60 relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#7c3aed]/10 border border-[#7c3aed]/20 flex items-center justify-center text-xl">💡</div>
              <div>
                <h3 className="text-base font-black text-[#f0f4f8]">Idea Generation & Monetization Engine</h3>
                <p className="text-xs text-[#64748b]">Configure autonomous, hourly concept design & prioritization.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] hover:border-[#7c3aed]/20 transition-all flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#94a3b8]">Enable Idea Engine Background Worker</p>
                  <p className="text-[10px] text-[#64748b] mt-0.5">Discovers, scores, and appends code optimization/income blueprints to Evolve_plan.md.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIeEnabled(!ieEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ieEnabled ? 'bg-[#7c3aed]' : 'bg-[#1e293b]'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ieEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#94a3b8]">Generation rate/hr</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={ieRate}
                    onChange={e => setIeRate(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-lg bg-[#04060b] border border-[#1e293b] text-[#f0f4f8] text-sm font-mono focus:outline-none focus:border-[#7c3aed]/40 transition-all"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#94a3b8]">Max daily creations</label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={ieMaxDaily}
                    onChange={e => setIeMaxDaily(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-lg bg-[#04060b] border border-[#1e293b] text-[#f0f4f8] text-sm font-mono focus:outline-none focus:border-[#7c3aed]/40 transition-all"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#94a3b8]">Min Rank Score (1-10)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1.0"
                    max="10.0"
                    value={ieMinScore}
                    onChange={e => setIeMinScore(Math.min(10.0, Math.max(1.0, Number(e.target.value))))}
                    className="w-full px-3 py-2 rounded-lg bg-[#04060b] border border-[#1e293b] text-[#f0f4f8] text-sm font-mono focus:outline-none focus:border-[#7c3aed]/40 transition-all"
                  />
                </div>
              </div>

              {/* Target Scopes Multiselect */}
              <div className="p-4 rounded-xl bg-[#090d16]/40 border border-[#141b2c] flex flex-col gap-2">
                <label className="text-xs font-semibold text-[#94a3b8]">Target Scopes / Focus Areas</label>
                <div className="flex flex-wrap gap-2">
                  {['everything', 'ui', 'backend', 'performance', 'security', 'architecture'].map(scope => {
                    const active = ieScopes.includes(scope)
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => toggleScope(scope)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border uppercase transition-all ${
                          active
                            ? 'bg-[#7c3aed]/20 text-[#c084fc] border-[#7c3aed]/40 shadow-[0_0_10px_rgba(124,58,237,0.15)]'
                            : 'bg-transparent text-[#64748b] border-[#1e293b] hover:text-[#f0f4f8]'
                        }`}
                      >
                        {scope}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── APPLY BUTTONS ── */}
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => refetchEvStatus()}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-cyan-500/10 hover:bg-cyan-500/20 text-[#00d4ff] border border-[#00d4ff]/20 transition-all flex items-center gap-2"
          >
            🔄 Refresh Live Telemetry
          </button>

          <button
            type="button"
            onClick={() => saveEvMut.mutate({
              self_evolution_enabled: evEnabled,
              evolution_interval_minutes: evInterval,
              evolution_max_patches_per_cycle: evMaxPatches,
              evolution_max_tokens: evMaxTokens,
              evolution_rollback_on_failure: evRollback,
              idea_engine_enabled: ieEnabled,
              idea_engine_rate_per_hour: ieRate,
              idea_engine_max_daily_executions: ieMaxDaily,
              idea_engine_scopes: ieScopes,
              idea_engine_min_score: ieMinScore
            })}
            disabled={saveEvMut.isPending}
            className="px-6 py-2.5 rounded-xl font-black text-sm bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-[#030508] hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saveEvMut.isPending ? 'Applying Settings...' : 'Apply Self-Evolution Config'}
          </button>
        </div>

        {/* ── RECENT CYCLES TELEMETRY TABLE ── */}
        <div className="glass-panel border border-[#141b2c] rounded-2xl p-6 bg-[#070b13]/60 relative overflow-hidden">
          <h3 className="text-sm font-black text-[#f0f4f8] mb-4 flex items-center gap-2">
            <span>📊</span> Recent 5 Evolution Cycles Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#94a3b8] font-mono">
              <thead>
                <tr className="border-b border-[#1e293b] text-[#64748b] text-[10px] uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Iteration #</th>
                  <th className="pb-3 font-semibold">Timestamp</th>
                  <th className="pb-3 font-semibold">Item ID</th>
                  <th className="pb-3 font-semibold text-center">Patches</th>
                  <th className="pb-3 font-semibold text-right">Result Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]/50">
                {evStatus?.last_5_cycles && evStatus.last_5_cycles.length > 0 ? (
                  evStatus.last_5_cycles.map((cycle: any, idx: number) => {
                    const result = cycle.verified ? 'success' : cycle.rolled_back ? 'rolled_back' : 'failed'
                    return (
                      <tr key={idx} className="hover:bg-[#090d16]/30 transition-colors">
                        <td className="py-3 font-bold text-[#f0f4f8]">#{cycle.iteration}</td>
                        <td className="py-3 text-[#64748b]">{new Date(cycle.timestamp).toLocaleString()}</td>
                        <td className="py-3 text-cyan-300 font-semibold">{cycle.item_implemented || 'N/A'}</td>
                        <td className="py-3 text-center text-[#f0f4f8]">{cycle.patches_applied} applied</td>
                        <td className="py-3 text-right">
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] uppercase font-bold ${getResultColor(result)}`}>
                            {result.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[#64748b]">No self-evolution cycle reports found. Let a cycle run!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#060a12] p-4 sm:p-6 lg:p-8 text-[#f0f4f8]">
      {toast && (
        <div className="fixed top-6 right-6 z-50 shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
          <div className={`px-4 py-3 rounded-xl border font-medium text-sm flex items-center gap-2 ${
            toast.startsWith('✓')
              ? 'bg-[#064e3b]/90 border-[#059669] text-emerald-300'
              : 'bg-[#991b1b]/90 border-[#ef4444] text-red-200'
          }`}>
            <span>{toast}</span>
          </div>
        </div>
      )}

      {isKeysError && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-sm">
            <span className="text-lg shrink-0">⚠️</span>
            <div>
              <span className="font-semibold">Backend unreachable</span>
              <span className="text-amber-400/70 ml-2 text-xs">Settings data could not be loaded. Start the backend and refresh.</span>
            </div>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['settings-keys'] })}
              className="ml-auto px-3 py-1 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all"
            >
              Retry
            </button>
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

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-[#141b2c]">
          {(['general', 'shopify', 'evolution'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-[#00d4ff] text-[#00d4ff]'
                  : 'border-transparent text-[#64748b] hover:text-[#f0f4f8]'
              }`}
            >
              {tab === 'general' ? 'General' : tab === 'shopify' ? 'Shopify' : 'Autonomous Evolution'}
            </button>
          ))}
        </div>

        {activeTab === 'shopify' && renderShopifyPanel()}

        {activeTab === 'evolution' && renderEvolutionPanel()}

        {activeTab === 'general' && <>

        {renderHealthPanel()}

        {renderConstitutionPanel()}

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
                value={paypalMeLink}
                onChange={e => setPaypalMeLink(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[#04060b] border border-[#1e293b] text-text-primary text-sm font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-[#10b981]/40 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                {t('revenue.price_label')}
              </label>
              <input
                type="number"
                value={defaultServicePrice}
                onChange={e => setDefaultServicePrice(Number(e.target.value))}
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
              onClick={() => saveGeneralMut.mutate({ paypal_me_link: paypalMeLink, default_service_price: defaultServicePrice })}
              disabled={saveGeneralMut.isPending}
              className="px-5 py-2.5 rounded-xl font-bold text-sm bg-[#10b981] hover:bg-[#059669] text-white transition-all duration-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50"
            >
              {saveGeneralMut.isPending ? 'Saving...' : t('revenue.save')}
            </button>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-text-muted/60 space-y-1">
          <p>🔒 {t('settings.encrypted_note')}</p>
          <p>{t('settings.env_note')}</p>
        </div>

        </>}
      </div>
    </div>
  )
}
