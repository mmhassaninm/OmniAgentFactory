// API Client with proper backend routing
import { BASE_URL } from './config'

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  // Ensure endpoint starts with /api if it doesn't already
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`

  // Build full URL using the BASE_URL from config
  const url = `${BASE_URL}${path}`

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  }

  const response = await fetch(url, {
    headers: defaultHeaders,
    ...options,
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorData
    try {
      errorData = JSON.parse(errorText)
    } catch {
      errorData = { message: errorText || response.statusText }
    }
    const error = new Error(errorData.message || errorData.detail || response.statusText)
    ;(error as any).status = response.status
    ;(error as any).data = errorData
    throw error
  }

  return response.json()
}

export function getApiUrl(endpoint: string): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${BASE_URL}${path}`
}
