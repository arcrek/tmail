import type {
  AccountResource,
  AccessCredential,
  AdminSettings,
  AdminSettingsUpdate,
  DashboardResource,
  DomainResource,
  HydraCollection,
  HydraError,
  MessageResource,
  MessageSummary,
  SiteResource,
  SyncStatus,
  TokenResponse,
  UnlockResponse,
} from './types'

interface RequestOptions extends RequestInit {
  token?: string
  csrf?: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: HydraError,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, csrf, ...init } = options
  const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers).entries())
  if (token) headers.Authorization = `Bearer ${token}`
  if (csrf) headers['X-CSRF-Token'] = csrf
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json'

  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (response.status === 204) return undefined as T

  const isJson = response.headers.get('content-type')?.includes('json')
  const body: unknown = isJson ? await response.json() : await response.blob()
  if (!response.ok) {
    const error = body as Partial<HydraError> & { detail?: string }
    throw new ApiError(
      response.status,
      error['hydra:description'] ?? error.detail ?? response.statusText ?? 'Request failed',
      error['@type'] === 'hydra:Error' ? error as HydraError : undefined,
    )
  }
  return body as T
}

export async function streamMessages(token: string, onUpdate: () => void, signal: AbortSignal): Promise<void> {
  const response = await fetch('/messages/stream', {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    signal,
  })
  if (!response.ok || !response.body) throw new ApiError(response.status, 'Stream failed')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      if (frame.startsWith('event: update')) onUpdate()
    }
  }
}

const json = (body: unknown): Pick<RequestInit, 'body'> => ({ body: JSON.stringify(body) })

export const api = {
  site: () => request<SiteResource>('/site'),
  domains: (page = 1, accessToken?: string) =>
    request<HydraCollection<DomainResource>>(`/domains?page=${page}`, { token: accessToken }),
  domain: (id: string) => request<DomainResource>(`/domains/${encodeURIComponent(id)}`),
  account: (address: string, accessToken?: string) =>
    request<AccountResource>('/accounts', { method: 'POST', token: accessToken, ...json({ address }) }),
  token: (address: string, accessToken?: string) =>
    request<TokenResponse>('/token', { method: 'POST', token: accessToken, ...json({ address }) }),
  unlock: (credential: string) =>
    request<UnlockResponse>('/unlock', { method: 'POST', ...json({ credential }) }),
  lock: (accessToken: string) =>
    request<void>('/lock', { method: 'DELETE', token: accessToken }),
  me: (token: string) => request<AccountResource>('/me', { token }),
  messages: (token: string, page = 1) =>
    request<HydraCollection<MessageSummary>>(`/messages?page=${page}`, { token }),
  message: (token: string, id: string) =>
    request<MessageResource>(`/messages/${encodeURIComponent(id)}`, { token }),
  setSeen: (token: string, id: string, seen: boolean) =>
    request<{ seen: boolean }>(`/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      ...json({ seen }),
    }),
  deleteMessage: (token: string, id: string) =>
    request<void>(`/messages/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  attachment: (token: string, messageId: string, blobId: string) =>
    request<Blob>(
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(blobId)}`,
      { token },
    ),
  source: (token: string, messageId: string) =>
    request<Blob>(`/sources/${encodeURIComponent(messageId)}`, { token }),
  admin: {
    login: (password: string) =>
      request<{ csrfToken: string }>('/admin/api/login', { method: 'POST', ...json({ password }) }),
    session: () => request<{ csrfToken: string }>('/admin/api/session'),
    logout: (csrf: string) =>
      request<void>('/admin/api/logout', { method: 'POST', csrf }),
    settings: () => request<AdminSettings>('/admin/api/settings'),
    updateSettings: (values: AdminSettingsUpdate, csrf: string) =>
      request<AdminSettings>('/admin/api/settings', { method: 'PUT', csrf, ...json(values) }),
    syncDomains: (csrf: string) =>
      request<{ domains: string[]; lastSync: SyncStatus }>('/admin/api/sync-domains', {
        method: 'POST',
        csrf,
      }),
    testMail: (csrf: string) =>
      request<{ ok: boolean; domainCount: number; messages: DashboardResource['messages'] }>(
        '/admin/api/test-mail',
        { method: 'POST', csrf },
      ),
    accessCredentials: {
      list: () => request<{ credentials: AccessCredential[] }>('/admin/api/access-credentials'),
      create: (body: { kind: 'password'; label: string; password: string } | { kind: 'token'; label: string }, csrf: string) =>
        request<AccessCredential & { secret?: string }>('/admin/api/access-credentials', { method: 'POST', csrf, ...json(body) }),
      remove: (id: string, csrf: string) =>
        request<void>(`/admin/api/access-credentials/${encodeURIComponent(id)}`, { method: 'DELETE', csrf }),
    },
    dashboard: () => request<DashboardResource>('/admin/api/dashboard'),
  },
}
