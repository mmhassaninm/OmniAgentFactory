import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang } from '../i18n/LanguageContext'
import {
  Zap, Cpu, Database, GitBranch, Activity, AlertCircle, CheckCircle2,
  AlertTriangle, Clock, TrendingUp, Grid3x3, Layers, Server, Smartphone,
  ShoppingBag, DollarSign, BookOpen, BarChart3, Shield, Sparkles
} from 'lucide-react'

interface DashboardStats {
  agentCount: number
  activeAgents: number
  totalEvolutions: number
  daysSinceStart: number
}

interface FactoryStatus {
  factory: {
    total_agents: number
    actively_evolving: number
    total_completions: number
    total_errors: number
    avg_score: number
  }
  models: any
  night_mode: boolean
}

interface ProviderHealth {
  provider: string
  status: 'online' | 'offline' | 'unconfigured'
  latency_ms: number
  keys_active: number
  keys_exhausted: number
}

interface ShopifyStatus {
  swarm_running: boolean
  total_themes_generated: number
  agents_online: number
  last_update: string
}

interface MoneyAgentStatus {
  agent_mode: string
  paypal_configured: boolean
  pending_pitches: number
  pending_emails: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [startTime] = useState(new Date('2026-01-01'))

  // Fetch factory status
  const { data: factoryStatus } = useQuery<FactoryStatus>({
    queryKey: ['factory-status'],
    queryFn: async () => {
      const res = await fetch('/api/factory/status')
      if (!res.ok) throw new Error('Failed to fetch factory status')
      return res.json()
    },
    refetchInterval: 5000,
  })

  // Fetch provider health
  const { data: providerHealth } = useQuery<ProviderHealth[]>({
    queryKey: ['provider-health'],
    queryFn: async () => {
      const res = await fetch('/api/factory/settings/provider-health')
      if (!res.ok) throw new Error('Failed to fetch provider health')
      return res.json()
    },
    refetchInterval: 30000,
  })

  // Fetch Shopify status
  const { data: shopifyStatus } = useQuery<ShopifyStatus>({
    queryKey: ['shopify-status'],
    queryFn: async () => {
      const res = await fetch('/api/shopify/status')
      if (!res.ok) throw new Error('Failed to fetch Shopify status')
      return res.json()
    },
    refetchInterval: 10000,
  })

  // Fetch Money Agent status and earnings
  const { data: moneyStatus } = useQuery<MoneyAgentStatus>({
    queryKey: ['money-agent-status'],
    queryFn: async () => {
      const res = await fetch('/api/money/status')
      if (!res.ok) return { agent_mode: 'offline', paypal_configured: false, pending_pitches: 0, pending_emails: 0 }
      return res.json()
    },
    refetchInterval: 10000,
  })

  const { data: moneyEarnings } = useQuery({
    queryKey: ['money-earnings'],
    queryFn: async () => {
      const res = await fetch('/api/money/earnings')
      if (!res.ok) return { today: 0, week: 0, month: 0, pitches_sent_week: 0 }
      return res.json()
    },
    refetchInterval: 30000,
  })

  const daysSinceStart = Math.floor(
    (new Date().getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24)
  )

  const onlineProviders = providerHealth?.filter(p => p.status === 'online').length || 0
  const totalProviders = providerHealth?.length || 0

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <CheckCircle2 className="w-5 h-5 text-green-500" />
    ) : (
      <AlertCircle className="w-5 h-5 text-red-500" />
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-500'
      case 'offline':
        return 'text-red-500'
      default:
        return 'text-yellow-500'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      {/* Header */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-8 h-8 text-blue-400" />
          <h1 className="text-4xl font-bold text-white">OmniBot Dashboard</h1>
        </div>
        <p className="text-slate-400 text-lg">
          Unified view of autonomous agent factory, AI providers, and subsystems
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Agents */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-blue-500 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm font-medium">Total Agents</span>
            <Grid3x3 className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {factoryStatus?.factory.total_agents || 0}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {factoryStatus?.factory.actively_evolving || 0} actively evolving
          </div>
        </div>

        {/* Average Score */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-green-500 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm font-medium">Avg Score</span>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {(factoryStatus?.factory.avg_score || 0).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Quality metric (0-1.0)
          </div>
        </div>

        {/* Total Evolutions */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-purple-500 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm font-medium">Total Cycles</span>
            <Zap className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {factoryStatus?.factory.total_completions || 0}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Successful evolution cycles
          </div>
        </div>

        {/* System Uptime */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-orange-500 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm font-medium">Days Running</span>
            <Clock className="w-5 h-5 text-orange-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {daysSinceStart}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Since January 2026
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Left Column - System Status */}
        <div className="lg:col-span-2 space-y-6">
          {/* Factory Core Systems */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Layers className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-bold text-white">Core Systems</h2>
            </div>
            <div className="space-y-4">
              {/* Agent Evolution */}
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="flex items-center gap-3">
                  <Cpu className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="font-medium text-white">Agent Evolution Engine</div>
                    <div className="text-sm text-slate-400">
                      {factoryStatus?.factory.actively_evolving || 0} agents evolving
                    </div>
                  </div>
                </div>
                {getStatusIcon(true)}
              </div>

              {/* Model Router */}
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="flex items-center gap-3">
                  <GitBranch className="w-5 h-5 text-purple-400" />
                  <div>
                    <div className="font-medium text-white">Model Router</div>
                    <div className="text-sm text-slate-400">
                      {onlineProviders}/{totalProviders} providers online
                    </div>
                  </div>
                </div>
                {getStatusIcon(onlineProviders > 0)}
              </div>

              {/* Database */}
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-blue-400" />
                  <div>
                    <div className="font-medium text-white">MongoDB</div>
                    <div className="text-sm text-slate-400">
                      Primary data store
                    </div>
                  </div>
                </div>
                {getStatusIcon(true)}
              </div>

              {/* Vector DB */}
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="font-medium text-white">ChromaDB</div>
                    <div className="text-sm text-slate-400">
                      Vector embeddings & caching
                    </div>
                  </div>
                </div>
                {getStatusIcon(true)}
              </div>
            </div>
          </div>

          {/* Subsystems Status */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Server className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold text-white">Subsystems</h2>
            </div>
            <div className="space-y-4">
              {/* Shopify Factory */}
              <div
                onClick={() => navigate('/shopify')}
                className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-green-500 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ShoppingBag className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="font-medium text-white">Shopify Theme Factory</div>
                    <div className="text-sm text-slate-400">
                      {shopifyStatus?.total_themes_generated || 0} themes generated
                    </div>
                  </div>
                </div>
                {getStatusIcon(shopifyStatus?.swarm_running || false)}
              </div>

              {/* Money Agent */}
              <div
                onClick={() => navigate('/money-agent')}
                className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-yellow-500 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="font-medium text-white">Money Agent</div>
                    <div className="text-sm text-slate-400">
                      ${(moneyEarnings?.month || 0).toFixed(2)} this month • {moneyEarnings?.pitches_sent_week || 0} pitches/week
                    </div>
                  </div>
                </div>
                {getStatusIcon(moneyStatus?.paypal_configured || false)}
              </div>

              {/* Evolution Loop */}
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-pink-400" />
                  <div>
                    <div className="font-medium text-white">Autonomous Evolution</div>
                    <div className="text-sm text-slate-400">
                      System self-improvement loop
                    </div>
                  </div>
                </div>
                {getStatusIcon(factoryStatus?.factory.actively_evolving || 0 > 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Provider Health */}
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-red-400" />
              <h2 className="text-xl font-bold text-white">AI Providers</h2>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {providerHealth?.map((provider) => (
                <div
                  key={provider.provider}
                  className="p-3 bg-slate-700/50 rounded-lg border border-slate-600"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white text-sm">
                      {provider.provider}
                    </span>
                    <span className={`text-xs font-semibold ${getStatusColor(provider.status)}`}>
                      {provider.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>
                      Latency: <span className="text-slate-300">{provider.latency_ms}ms</span>
                    </div>
                    <div>
                      Keys: <span className="text-slate-300">{provider.keys_active}✓ {provider.keys_exhausted}✗</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Access */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Smartphone className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold text-white">Quick Access</h2>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/factory')}
                className="w-full text-left px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm border border-slate-600"
              >
                → Agent Factory
              </button>
              <button
                onClick={() => navigate('/dev-loop')}
                className="w-full text-left px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm border border-slate-600"
              >
                → Evolution Dashboard
              </button>
              <button
                onClick={() => navigate('/models')}
                className="w-full text-left px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm border border-slate-600"
              >
                → Model Hub
              </button>
              <button
                onClick={() => navigate('/evolution')}
                className="w-full text-left px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm border border-slate-600"
              >
                → Ideas & Problems Registry
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="w-full text-left px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-sm border border-slate-600"
              >
                → Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">System Information</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-slate-400 mb-1">Stack</div>
            <div className="text-white font-medium">
              Python 3.11 · FastAPI · LangGraph · React · TypeScript
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-1">Infrastructure</div>
            <div className="text-white font-medium">
              Docker Compose · MongoDB · ChromaDB · WebSocket
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400 mb-1">Environment</div>
            <div className="text-white font-medium">
              Windows 11 Host · Ubuntu 22.04 Runtime
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
