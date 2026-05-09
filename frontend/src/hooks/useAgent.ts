import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const API_BASE = '/api/factory'

export interface Agent {
  id: string
  name: string
  goal: string
  version: number
  status: string
  score: number
  config: Record<string, any>
  agent_code: string
  test_cases: any[]
  evolve_interval_seconds: number
  created_at: string
  updated_at: string
  catalog?: any
}

interface CreateAgentPayload {
  name: string
  goal: string
  template: string
  config?: Record<string, any>
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

// ── Queries ──────────────────────────────────────────────────────────

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchJson(`${API_BASE}/agents`),
    refetchInterval: 3000,
  })
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => fetchJson(`${API_BASE}/agents/${agentId}`),
    refetchInterval: 2000,
    enabled: !!agentId,
  })
}

export function useAgentThoughts(agentId: string, limit = 50) {
  return useQuery({
    queryKey: ['thoughts', agentId],
    queryFn: () => fetchJson(`${API_BASE}/agents/${agentId}/thoughts?limit=${limit}`),
    refetchInterval: 2000,
    enabled: !!agentId,
  })
}

export function useAgentVersions(agentId: string) {
  return useQuery({
    queryKey: ['versions', agentId],
    queryFn: () => fetchJson(`${API_BASE}/agents/${agentId}/versions`),
    enabled: !!agentId,
  })
}

export function useAgentCatalog(agentId: string) {
  return useQuery({
    queryKey: ['catalog', agentId],
    queryFn: () => fetchJson(`${API_BASE}/agents/${agentId}/catalog`),
    enabled: !!agentId,
  })
}

export function useFactoryStatus() {
  return useQuery({
    queryKey: ['factory-status'],
    queryFn: () => fetchJson(`${API_BASE}/status`),
    refetchInterval: 5000,
  })
}

export function useModelHealth() {
  return useQuery({
    queryKey: ['model-health'],
    queryFn: () => fetchJson(`${API_BASE}/models`),
    refetchInterval: 10000,
  })
}

// ── Mutations ────────────────────────────────────────────────────────

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAgentPayload) =>
      fetchJson(`${API_BASE}/agents`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (agentId: string) =>
      fetchJson(`${API_BASE}/agents/${agentId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useControlAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, mode }: { agentId: string; mode: string }) =>
      fetchJson(`${API_BASE}/agents/${agentId}/control`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useEvolveAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (agentId: string) =>
      fetchJson(`${API_BASE}/agents/${agentId}/evolve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useResumeAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (agentId: string) =>
      fetchJson(`${API_BASE}/agents/${agentId}/resume`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useFixAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, instruction }: { agentId: string; instruction: string }) =>
      fetchJson(`${API_BASE}/agents/${agentId}/fix`, {
        method: 'POST',
        body: JSON.stringify({ instruction }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useRunAgent() {
  return useMutation({
    mutationFn: ({ agentId, message }: { agentId: string; message: string }) =>
      fetchJson(`${API_BASE}/agents/${agentId}/run`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
  })
}

export function useAgentConversations(agentId: string) {
  return useQuery({
    queryKey: ['conversations', agentId],
    queryFn: () => fetchJson(`${API_BASE}/agents/${agentId}/conversations`),
    enabled: !!agentId,
  })
}

export function useAgentBudget(agentId: string) {
  return useQuery({
    queryKey: ['agent-budget', agentId],
    queryFn: () => fetchJson(`${API_BASE}/agents/${agentId}/budget`),
    refetchInterval: 5000,
    enabled: !!agentId,
  })
}

export function useUpdateAgentBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, dailyTokenLimit }: { agentId: string; dailyTokenLimit: number }) =>
      fetchJson(`${API_BASE}/agents/${agentId}/budget`, {
        method: 'PUT',
        body: JSON.stringify({ daily_token_limit: dailyTokenLimit }),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['agent-budget', variables.agentId] })
      qc.invalidateQueries({ queryKey: ['agent', variables.agentId] })
    },
  })
}


export function useAgentRules(agentId: string) {
  return useQuery({
    queryKey: ['rules', agentId],
    queryFn: () => fetchJson(`${API_BASE}/agents/${agentId}/rules`),
    refetchInterval: 2000,
    enabled: !!agentId,
  })
}

export function useAddAgentRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      agentId,
      rule,
      category,
      priority,
    }: {
      agentId: string
      rule: string
      category: string
      priority: string
    }) =>
      fetchJson(`${API_BASE}/agents/${agentId}/rules`, {
        method: 'POST',
        body: JSON.stringify({ rule, category, priority }),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['rules', variables.agentId] })
      qc.invalidateQueries({ queryKey: ['agent', variables.agentId] })
    },
  })
}

export function useUpdateAgentRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      agentId,
      ruleId,
      rule,
      category,
      priority,
      status,
    }: {
      agentId: string
      ruleId: string
      rule?: string
      category?: string
      priority?: string
      status?: string
    }) =>
      fetchJson(`${API_BASE}/agents/${agentId}/rules/${ruleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ rule, category, priority, status }),
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['rules', variables.agentId] })
      qc.invalidateQueries({ queryKey: ['agent', variables.agentId] })
    },
  })
}

export function useDeleteAgentRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, ruleId }: { agentId: string; ruleId: string }) =>
      fetchJson(`${API_BASE}/agents/${agentId}/rules/${ruleId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['rules', variables.agentId] })
      qc.invalidateQueries({ queryKey: ['agent', variables.agentId] })
    },
  })
}
