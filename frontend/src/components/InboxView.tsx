import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ApiError, api, streamMessages } from '../api'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { authorizationFailed, openMailbox } from '../mailbox-access'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { randomDomain, randomLocalPart } from '../randomAddress'
import { playNewMailChime, setSoundEnabled, useSoundEnabled } from '../sound'
import { useToast } from '../toast'
import type { AddressSession, DomainResource, HydraCollection, MessageSummary } from '../types'
import { extractVerificationCode, groupCode } from '../verificationCode'
import { AppIcon } from './AppIcon'
import { MessageReader } from './MessageReader'
import { QrCodeModal } from './QrCodeModal'

export interface InboxViewProps {
  session: AddressSession
  fetchSeconds: number
  accessToken?: string
  onCreate: (session: AddressSession) => void
  onLogin: (address: string) => void
  onInvalid: () => void
  onManage: () => void
  onLogout: () => void
}

function initial(item: MessageSummary): string {
  return (item.from.name || item.from.address || '?').trim().charAt(0).toUpperCase() || '?'
}

export function InboxView({
  session,
  fetchSeconds,
  accessToken = '',
  onCreate,
  onLogin,
  onInvalid,
  onManage,
  onLogout,
}: InboxViewProps) {
  const { t, formatDate: localDate } = useI18n()
  const toast = useToast()
  const soundOn = useSoundEnabled()

  const [collection, setCollection] = useState<HydraCollection<MessageSummary> | null>(null)
  const [codeCache, setCodeCache] = useState<Map<string, string>>(() => new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() =>
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  )
  const [createDomains, setCreateDomains] = useState<DomainResource[]>([])
  const [createDomain, setCreateDomain] = useState('')
  const [createLocalPart, setCreateLocalPart] = useState('')
  const [createLoadingDomains, setCreateLoadingDomains] = useState(false)
  const [createDomainError, setCreateDomainError] = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(fetchSeconds)
  const [createExpanded, setCreateExpanded] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [accessInvalid, setAccessInvalid] = useState(false)

  const listHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const mailToastsRef = useRef<Set<number>>(new Set())
  const intervalRef = useRef<number | undefined>(undefined)
  const countdownIntervalRef = useRef<number | undefined>(undefined)
  const streamControllerRef = useRef<AbortController | undefined>(undefined)
  const requestVersionRef = useRef(0)
  const initializedRef = useRef(false)
  const accessInvalidRef = useRef(false)
  const sessionVersionRef = useRef(0)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const codeCacheRef = useRef<Map<string, string>>(new Map())
  const codeFetchesRef = useRef<Map<string, Promise<string>>>(new Map())
  const createDomainsVersionRef = useRef(0)
  const lastSelectedIdRef = useRef<string | null>(null)
  const pageRef = useRef(1)
  const refreshingRef = useRef(false)
  const notificationPermissionRef = useRef(notificationPermission)
  notificationPermissionRef.current = notificationPermission

  const sessionRef = useRef(session)
  sessionRef.current = session
  const fetchSecondsRef = useRef(fetchSeconds)
  fetchSecondsRef.current = fetchSeconds
  const accessTokenRef = useRef(accessToken)
  accessTokenRef.current = accessToken
  const callbacksRef = useRef({ onCreate, onLogin, onInvalid, onManage, onLogout, t, toast })
  callbacksRef.current = { onCreate, onLogin, onInvalid, onManage, onLogout, t, toast }

  function clearMailToasts(): void {
    for (const id of mailToastsRef.current) callbacksRef.current.toast.dismiss(id)
    mailToastsRef.current.clear()
  }

  function failure(cause: unknown): string {
    return cause instanceof ApiError ? cause.message : callbacksRef.current.t('error.inbox')
  }

  function createFailure(cause: unknown): string {
    return cause instanceof ApiError ? cause.message : callbacksRef.current.t('error.unavailable')
  }

  function formatDate(value: string): string {
    return localDate(value, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function stopPolling(): void {
    if (intervalRef.current !== undefined) window.clearInterval(intervalRef.current)
    if (countdownIntervalRef.current !== undefined) window.clearInterval(countdownIntervalRef.current)
    intervalRef.current = undefined
    countdownIntervalRef.current = undefined
  }

  function startPolling(): void {
    stopPolling()
    if (accessInvalidRef.current) return
    if (!document.hidden) {
      const seconds = Math.max(1, fetchSecondsRef.current)
      setRemainingSeconds(seconds)
      countdownIntervalRef.current = window.setInterval(() => {
        setRemainingSeconds((prev) => (prev > 1 ? prev - 1 : prev))
      }, 1000)
      intervalRef.current = window.setInterval(() => {
        setRemainingSeconds(Math.max(1, fetchSecondsRef.current))
        void refresh()
      }, seconds * 1000)
    }
  }

  function invalidateAccess(): void {
    if (accessInvalidRef.current) return
    accessInvalidRef.current = true
    setAccessInvalid(true)
    clearMailToasts()
    ++sessionVersionRef.current
    ++requestVersionRef.current
    setCollection(null)
    setSelectedId(null)
    codeCacheRef.current = new Map()
    setCodeCache(new Map())
    codeFetchesRef.current = new Map()
    knownIdsRef.current.clear()
    setShowQrModal(false)
    streamControllerRef.current?.abort()
    streamControllerRef.current = undefined
    stopPolling()
    refreshingRef.current = false
    setRefreshing(false)
    setLoading(false)
    setError(callbacksRef.current.t('password.changed'))
    callbacksRef.current.onInvalid()
  }

  async function copyAction(
    text: string,
    noticeKey: 'address.copied' | 'inbox.codeCopied' = 'address.copied',
  ): Promise<void> {
    try {
      await copyText(text)
      callbacksRef.current.toast.success(callbacksRef.current.t(noticeKey))
    } catch {
      callbacksRef.current.toast.error(callbacksRef.current.t('error.copy'))
    }
  }

  // Shared by resolveCodes() (row chips) and announceToast() (new-mail toast) so a
  // message that arrives while the list is open only triggers one api.message()
  // call, not two independent fetches racing each other. Cached/in-flight per id
  // (codeCache/codeFetches); the write is gated on the session that started the
  // fetch still being current — a poll-triggered requestVersion bump alone must
  // not discard an otherwise-valid same-session result.
  async function fetchCode(item: MessageSummary): Promise<string> {
    const cached = codeCacheRef.current.get(item.id)
    if (cached !== undefined) return cached
    const currentSession = sessionRef.current
    const version = sessionVersionRef.current
    let fetchPromise = codeFetchesRef.current.get(item.id)
    if (!fetchPromise) {
      fetchPromise = api
        .message(currentSession.token, item.id)
        .then((full) => extractVerificationCode(full.subject, full.text, full.html))
      codeFetchesRef.current.set(item.id, fetchPromise)
      const clearFetch = () => {
        if (codeFetchesRef.current.get(item.id) === fetchPromise) {
          codeFetchesRef.current.delete(item.id)
        }
      }
      void fetchPromise.then(clearFetch, clearFetch)
    }
    try {
      const code = await fetchPromise
      if (
        version !== sessionVersionRef.current ||
        accessInvalidRef.current ||
        sessionRef.current.token !== currentSession.token
      ) {
        return ''
      }
      codeCacheRef.current.set(item.id, code)
      setCodeCache(new Map(codeCacheRef.current))
      return code
    } catch (cause) {
      if (version === sessionVersionRef.current && authorizationFailed(cause)) invalidateAccess()
      throw cause
    }
  }

  async function announceToast(item: MessageSummary): Promise<void> {
    const address = sessionRef.current.address
    const version = sessionVersionRef.current
    let code = ''
    try {
      code = await fetchCode(item)
    } catch {
      // best-effort — still show the toast with just the copy-email action
    }
    if (version !== sessionVersionRef.current || accessInvalidRef.current) return
    const curT = callbacksRef.current.t
    const actions = [
      { label: curT('inbox.copyEmailAction'), onClick: () => void copyAction(address) },
      ...(code
        ? [
            {
              label: curT('inbox.copyCodeAction'),
              onClick: () => void copyAction(code, 'inbox.codeCopied'),
              primary: true,
            },
          ]
        : []),
    ]
    const id = callbacksRef.current.toast.mail(item.subject || curT('inbox.noSubject'), {
      code,
      actions,
    })
    if (id !== undefined) mailToastsRef.current.add(id)
  }

  async function resolveCodes(items: MessageSummary[]): Promise<void> {
    const targets = items.filter((item) => !codeCacheRef.current.has(item.id))
    const concurrency = 2
    const version = sessionVersionRef.current
    for (let i = 0; i < targets.length; i += concurrency) {
      if (version !== sessionVersionRef.current || accessInvalidRef.current) return
      const chunk = targets.slice(i, i + concurrency)
      await Promise.allSettled(chunk.map((item) => fetchCode(item)))
    }
  }

  function notifyNew(items: MessageSummary[]): void {
    if (!initializedRef.current) {
      initializedRef.current = true
      for (const item of items) knownIdsRef.current.add(item.id)
      return
    }
    let hasNew = false
    for (const item of items) {
      if (!knownIdsRef.current.has(item.id)) {
        knownIdsRef.current.add(item.id)
        hasNew = true
        if (notificationPermissionRef.current === 'granted' && typeof Notification !== 'undefined') {
          new Notification(callbacksRef.current.t('inbox.newMessage'), {
            body: callbacksRef.current.t('inbox.newMessageBody'),
          })
        }
        void announceToast(item)
      }
    }
    if (hasNew) {
      playNewMailChime()
    }
  }

  async function refresh(): Promise<void> {
    if (refreshingRef.current || accessInvalidRef.current) return
    const version = ++requestVersionRef.current
    const currentSessionVersion = sessionVersionRef.current
    const requestedPage = pageRef.current
    refreshingRef.current = true
    setRefreshing(true)
    setError('')
    try {
      const value = await api.messages(sessionRef.current.token, requestedPage)
      if (version !== requestVersionRef.current) return
      setCollection(value)
      void resolveCodes(value['hydra:member'])
      if (requestedPage === 1) notifyNew(value['hydra:member'])
    } catch (cause) {
      if (currentSessionVersion !== sessionVersionRef.current) return
      if (authorizationFailed(cause)) invalidateAccess()
      else if (version === requestVersionRef.current) setError(failure(cause))
    } finally {
      if (version === requestVersionRef.current) {
        setLoading(false)
        refreshingRef.current = false
        setRefreshing(false)
        setRemainingSeconds(Math.max(1, fetchSecondsRef.current))
      }
    }
  }

  function startStream(): void {
    stopPolling()
    streamControllerRef.current?.abort()
    const controller = new AbortController()
    streamControllerRef.current = controller
    const currentSession = sessionRef.current
    const version = sessionVersionRef.current
    const fallback = async (cause?: unknown) => {
      if (
        streamControllerRef.current !== controller ||
        controller.signal.aborted ||
        version !== sessionVersionRef.current
      ) {
        return
      }
      streamControllerRef.current = undefined
      if (authorizationFailed(cause)) {
        invalidateAccess()
        return
      }
      try {
        const account = await api.me(currentSession.token)
        if (version !== sessionVersionRef.current || accessInvalidRef.current) return
        if (account.address !== currentSession.address) {
          invalidateAccess()
          return
        }
        if (currentSession.accessKind === 'admin' && account.accessKind !== 'admin') {
          invalidateAccess()
          return
        }
      } catch (causeErr) {
        if (version !== sessionVersionRef.current || accessInvalidRef.current) return
        if (authorizationFailed(causeErr)) {
          invalidateAccess()
          return
        }
      }
      if (version === sessionVersionRef.current && !accessInvalidRef.current) startPolling()
    }
    // Both a rejected stream (network error, non-OK response) and a stream that
    // simply ends (server closed the connection, proxy killed it) must fall
    // back to polling — only an intentional abort() should not.
    void streamMessages(currentSession.token, () => void refresh(), controller.signal).then(
      () => fallback(),
      fallback,
    )
  }

  function restartRefresh(): void {
    requestVersionRef.current += 1
    refreshingRef.current = false
    setRefreshing(false)
    void refresh()
  }

  async function loadCreateDomains(): Promise<void> {
    const version = ++createDomainsVersionRef.current
    setCreateLoadingDomains(true)
    setCreateDomainError('')
    try {
      const response = await api.domains(1, accessTokenRef.current || undefined)
      if (version !== createDomainsVersionRef.current) return
      const active = response['hydra:member'].filter((domain) => domain.isActive !== false)
      setCreateDomains(active)
      setCreateDomain(active[0]?.domain ?? '')
    } catch (cause) {
      if (version !== createDomainsVersionRef.current) return
      setCreateDomainError(createFailure(cause))
    } finally {
      if (version === createDomainsVersionRef.current) setCreateLoadingDomains(false)
    }
  }

  const createAddress =
    createLocalPart && createDomain
      ? `${createLocalPart.trim().toLowerCase()}@${createDomain}`
      : ''

  async function submitCreateAddress(submittedAddress: string): Promise<void> {
    if (!submittedAddress) return
    const version = sessionVersionRef.current
    setCreateSubmitting(true)
    try {
      const nextSession = await openMailbox(submittedAddress, accessTokenRef.current || undefined)
      if (version !== sessionVersionRef.current) return
      callbacksRef.current.onCreate(nextSession)
      // The form stays visible after creating (it no longer closes), so leave the
      // domain select on a valid option instead of blanking it to '' — otherwise it
      // renders unselected until something else reloads the domain list.
      setCreateLocalPart('')
      setCreateDomain(createDomains[0]?.domain ?? '')
    } catch (cause) {
      if (version !== sessionVersionRef.current) return
      if (authorizationFailed(cause)) callbacksRef.current.onLogin(submittedAddress)
      else callbacksRef.current.toast.error(createFailure(cause))
    } finally {
      setCreateSubmitting(false)
    }
  }

  async function handleSubmitCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await submitCreateAddress(createAddress)
  }

  async function randomizeCreate(): Promise<void> {
    if (!createDomains.length || createSubmitting) return
    const nextLocal = randomLocalPart()
    const nextDomain = randomDomain(createDomains.map((domain) => domain.domain))
    setCreateLocalPart(nextLocal)
    setCreateDomain(nextDomain)
    await submitCreateAddress(`${nextLocal.trim().toLowerCase()}@${nextDomain}`)
  }

  async function copyAddress(): Promise<void> {
    try {
      await copyText(session.address)
      toast.success(t('address.copiedNotice'))
    } catch {
      toast.error(t('error.copy'))
    }
  }

  async function enableNotifications(): Promise<void> {
    if (typeof Notification === 'undefined') {
      setNotice(t('inbox.notificationsUnavailable'))
      return
    }
    const perm = await Notification.requestPermission()
    notificationPermissionRef.current = perm
    setNotificationPermission(perm)
    setNotice(perm === 'granted' ? t('inbox.notificationsEnabled') : t('inbox.notificationsOff'))
  }

  function toggleSound(): void {
    setSoundEnabled(!soundOn)
  }

  function changePage(next: number): void {
    pageRef.current = next
    setPage(next)
    setSelectedId(null)
    setQuery('')
    setLoading(true)
    restartRefresh()
  }

  function markSeen(id: string): void {
    setCollection((prev) => {
      if (!prev) return prev
      let changed = false
      const members = prev['hydra:member'].map((item) => {
        if (item.id === id && !item.seen) {
          changed = true
          return { ...item, seen: true }
        }
        return item
      })
      return changed ? { ...prev, 'hydra:member': members } : prev
    })
  }

  function removeMessage(): void {
    setSelectedId(null)
    void refresh()
  }

  function removeStale(): void {
    setSelectedId(null)
    void refresh()
  }

  // On phones the new-address FAB is fixed at the bottom while the form renders at the top
  // of the page; move focus (and with it the scroll position) to the form when it opens.
  useEffect(() => {
    if (!createExpanded) return
    document.getElementById('inbox-create-local-part')?.focus()
  }, [createExpanded])

  // The list stays mounted beside the reader (and is only hidden by CSS on narrow screens),
  // so closing the reader returns focus to the row that opened it, falling back to the
  // list heading when that row is gone (deleted, paged away, or filtered out).
  useEffect(() => {
    if (selectedId !== null) {
      lastSelectedIdRef.current = selectedId
      return
    }
    const previous = lastSelectedIdRef.current
    if (previous === null) return
    const row = [...document.querySelectorAll<HTMLElement>('.message-row')].find(
      (node) => node.dataset.messageId === previous,
    )
    ;(row ?? listHeadingRef.current)?.focus()
  }, [selectedId])

  // Session lifecycle: initial load, reset on address/token change, and cleanup on unmount.
  useEffect(() => {
    clearMailToasts()
    ++sessionVersionRef.current
    accessInvalidRef.current = false
    setAccessInvalid(false)
    requestVersionRef.current += 1
    pageRef.current = 1
    setPage(1)
    setCollection(null)
    setSelectedId(null)
    lastSelectedIdRef.current = null
    setQuery('')
    setLoading(true)
    refreshingRef.current = false
    setRefreshing(false)
    setError('')
    setNotice('')
    initializedRef.current = false
    knownIdsRef.current = new Set<string>()
    codeCacheRef.current = new Map()
    setCodeCache(new Map())
    codeFetchesRef.current = new Map()
    streamControllerRef.current?.abort()
    streamControllerRef.current = undefined

    void refresh()
    startStream()

    return () => {
      clearMailToasts()
      ++sessionVersionRef.current
      accessInvalidRef.current = true
      requestVersionRef.current += 1
      streamControllerRef.current?.abort()
      streamControllerRef.current = undefined
      stopPolling()
    }
  }, [session.address, session.token])

  // Visibility change listener for pausing/resuming fallback polling.
  useEffect(() => {
    const handleVisibility = (): void => {
      if (accessInvalidRef.current) return
      if (streamControllerRef.current) return
      if (document.hidden) stopPolling()
      else {
        restartRefresh()
        startPolling()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Restart polling cadence when fetchSeconds prop changes while polling is active.
  const prevFetchSecondsRef = useRef(fetchSeconds)
  useEffect(() => {
    if (prevFetchSecondsRef.current !== fetchSeconds) {
      prevFetchSecondsRef.current = fetchSeconds
      if (!streamControllerRef.current) startPolling()
    }
  }, [fetchSeconds])

  // Load receiving domains for the inline create form on mount and accessToken change.
  useEffect(() => {
    void loadCreateDomains()
    return () => {
      ++createDomainsVersionRef.current
    }
  }, [accessToken])

  const pageMessages = useMemo(() => {
    const items = collection?.['hydra:member'] ?? []
    return [...items].sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
    )
  }, [collection])

  const messages = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return pageMessages
    return pageMessages.filter(
      (item) =>
        item.subject.toLowerCase().includes(needle) ||
        item.from.address.toLowerCase().includes(needle) ||
        (item.from.name ?? '').toLowerCase().includes(needle),
    )
  }, [pageMessages, query])

  const latestCode = useMemo(() => {
    if (page !== 1) return null
    // Walk newest-first; stop at a message whose code is still unresolved so an older
    // code is never shown as "latest" while the newest message is being inspected.
    for (const item of pageMessages) {
      if (!codeCache.has(item.id)) return null
      const code = codeCache.get(item.id)
      if (code) return { code, from: item.from.name || item.from.address }
    }
    return null
  }, [page, pageMessages, codeCache])

  const passwordLabel = !session.protected
    ? t('password.set')
    : session.accessKind === 'admin'
      ? t('password.reset')
      : t('password.change')

  const canPrevious = Boolean(collection?.['hydra:view']?.['hydra:previous'])
  const canNext = Boolean(collection?.['hydra:view']?.['hydra:next'])

  return (
    <Box
      component="section"
      className={selectedId ? 'inbox-view has-reader' : 'inbox-view'}
      aria-labelledby="inbox-title"
      sx={{
        display: 'grid',
        gap: 1.5,
        minWidth: 0,
        '@media (max-width: 640px)': {
          pb: 'calc(5rem + env(safe-area-inset-bottom))',
        },
      }}
    >
      <Box
        className="inbox-top"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          gap: 1.5,
          minWidth: 0,
        }}
      >
        <Paper
          className="panel inbox-hero"
          sx={(theme) => ({
            flex: '999 1 40rem',
            minWidth: 0,
            borderRadius: '28px',
            bgcolor: theme.palette.m3.surfaceContainerLow,
            color: theme.palette.m3.onSurface,
            p: { xs: 2, sm: 2.5 },
            display: 'grid',
            gap: 1.5,
          })}
        >
          <Box
            className="inbox-hero-main"
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: { xs: 1.5, sm: 2 },
              minWidth: 0,
            }}
          >
            <Box
              className="inbox-hero-address"
              sx={{
                display: 'grid',
                flex: '1 1 16rem',
                minWidth: 0,
                gap: 0.25,
              }}
            >
              <Box
                component="small"
                className="inbox-status mailbox-security"
                sx={(theme) => ({
                  display: 'inline-flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 0.75,
                  color: theme.palette.m3.onSurfaceVariant,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  letterSpacing: '0.03em',
                })}
              >
                <Box
                  component="span"
                  className="countdown-dot"
                  aria-hidden="true"
                  sx={(theme) => ({
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: theme.palette.m3.success,
                    flexShrink: 0,
                  })}
                />
                {session.accessKind === 'admin' ? (
                  <>
                    <span>{t('password.admin')}</span>
                    <span aria-hidden="true">·</span>
                  </>
                ) : null}
                {session.protectedUntil ? (
                  <span>
                    {t('password.deadline', {
                      date: localDate(session.protectedUntil, {
                        dateStyle: 'long',
                        timeStyle: 'short',
                      }),
                    })}
                  </span>
                ) : (
                  <span>{session.protected ? t('inbox.protected') : t('password.public')}</span>
                )}
                <span aria-hidden="true">·</span>
                <span className="refresh-countdown-pill" aria-live="polite">
                  {refreshing
                    ? t('inbox.refreshing')
                    : t('inbox.refreshIn', { seconds: remainingSeconds })}
                </span>
              </Box>
              <Typography
                id="inbox-title"
                component="h1"
                className="inbox-address"
                sx={{
                  fontFamily: MONO_FONT_FAMILY,
                  fontSize: 'clamp(1.05rem, 2vw, 1.5rem)',
                  fontWeight: 500,
                  lineHeight: 1.3,
                  letterSpacing: 0,
                  overflowWrap: 'anywhere',
                  m: 0,
                }}
              >
                {session.address}
              </Typography>
            </Box>

            <Box
              className="inbox-hero-actions"
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 0.75,
                '@media (max-width: 640px)': {
                  width: '100%',
                },
              }}
            >
              <Button
                className="primary-button"
                variant="contained"
                type="button"
                startIcon={<AppIcon name="copy" />}
                onClick={() => void copyAddress()}
                sx={{
                  flex: '0 0 auto',
                  mr: { xs: 0, sm: 0.5 },
                  '@media (max-width: 640px)': {
                    flex: '1 1 auto',
                    minHeight: 48,
                  },
                }}
              >
                {t('address.copy')}
              </Button>

              <Box
                className="inbox-toolbar"
                sx={(theme) => ({
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 0.5,
                  '@media (max-width: 640px)': {
                    position: 'fixed',
                    right: 0,
                    bottom: 0,
                    left: 0,
                    zIndex: 90,
                    flexWrap: 'nowrap',
                    gap: 0,
                    minHeight: '5rem',
                    px: 1.5,
                    pb: 'env(safe-area-inset-bottom)',
                    overflowX: 'auto',
                    bgcolor: theme.palette.m3.surfaceContainer,
                    borderTop: `1px solid ${theme.palette.m3.outlineVariant}`,
                  },
                })}
              >
                <IconButton
                  className="icon-button"
                  type="button"
                  data-action="refresh"
                  title={t('inbox.refresh')}
                  aria-label={refreshing ? t('inbox.refreshing') : t('inbox.refresh')}
                  disabled={refreshing}
                  onClick={() => void refresh()}
                  sx={(theme) => ({
                    color: theme.palette.m3.onSurfaceVariant,
                    '&:hover': { bgcolor: theme.palette.m3.surfaceContainerHigh },
                    '@media (max-width: 640px)': { minWidth: 48, minHeight: 48, flexShrink: 0 },
                  })}
                >
                  <AppIcon
                    name="refresh-cw"
                    className={refreshing ? 'spinning' : undefined}
                    sx={
                      refreshing
                        ? {
                            '@keyframes tmail-spin': {
                              from: { transform: 'rotate(0deg)' },
                              to: { transform: 'rotate(360deg)' },
                            },
                            animation: 'tmail-spin 0.8s linear infinite',
                          }
                        : undefined
                    }
                  />
                  <span className="sr-only">
                    {refreshing ? t('inbox.refreshing') : t('inbox.refresh')}
                  </span>
                </IconButton>

                <IconButton
                  className="icon-button"
                  type="button"
                  data-action="qr-code"
                  title={t('inbox.showQr')}
                  aria-label={t('inbox.showQr')}
                  onClick={() => setShowQrModal(true)}
                  sx={(theme) => ({
                    color: theme.palette.m3.onSurfaceVariant,
                    '&:hover': { bgcolor: theme.palette.m3.surfaceContainerHigh },
                    '@media (max-width: 640px)': { minWidth: 48, minHeight: 48, flexShrink: 0 },
                  })}
                >
                  <AppIcon name="qr" />
                  <span className="sr-only">{t('inbox.showQr')}</span>
                </IconButton>

                <IconButton
                  className="icon-button"
                  type="button"
                  data-action="sound"
                  title={t('inbox.toggleSound')}
                  aria-label={t('inbox.toggleSound')}
                  aria-pressed={soundOn}
                  onClick={toggleSound}
                  sx={(theme) => ({
                    bgcolor: soundOn ? theme.palette.m3.secondaryContainer : 'transparent',
                    color: soundOn
                      ? theme.palette.m3.onSecondaryContainer
                      : theme.palette.m3.onSurfaceVariant,
                    '&:hover': {
                      bgcolor: soundOn
                        ? theme.palette.m3.secondaryContainer
                        : theme.palette.m3.surfaceContainerHigh,
                    },
                    '@media (max-width: 640px)': { minWidth: 48, minHeight: 48, flexShrink: 0 },
                  })}
                >
                  <AppIcon name={soundOn ? 'volume-2' : 'volume-x'} />
                  <span className="sr-only">{t('inbox.toggleSound')}</span>
                </IconButton>

                <IconButton
                  className="icon-button"
                  type="button"
                  data-action="notifications"
                  title={
                    notificationPermission === 'granted'
                      ? t('inbox.notificationsOn')
                      : t('inbox.enableNotifications')
                  }
                  aria-label={t('inbox.enableNotifications')}
                  aria-pressed={notificationPermission === 'granted'}
                  disabled={notificationPermission === 'granted'}
                  onClick={() => void enableNotifications()}
                  sx={(theme) => ({
                    bgcolor:
                      notificationPermission === 'granted'
                        ? theme.palette.m3.secondaryContainer
                        : 'transparent',
                    color:
                      notificationPermission === 'granted'
                        ? theme.palette.m3.onSecondaryContainer
                        : theme.palette.m3.onSurfaceVariant,
                    '&:hover': { bgcolor: theme.palette.m3.surfaceContainerHigh },
                    '@media (max-width: 640px)': { minWidth: 48, minHeight: 48, flexShrink: 0 },
                  })}
                >
                  <AppIcon name={notificationPermission === 'granted' ? 'bell-ring' : 'bell'} />
                  <span className="sr-only">{t('inbox.enableNotifications')}</span>
                </IconButton>

                <IconButton
                  className="icon-button"
                  type="button"
                  data-action="password"
                  title={passwordLabel}
                  aria-label={passwordLabel}
                  disabled={accessInvalid}
                  onClick={onManage}
                  sx={(theme) => ({
                    bgcolor: session.protected ? theme.palette.m3.secondaryContainer : 'transparent',
                    color: session.protected
                      ? theme.palette.m3.onSecondaryContainer
                      : theme.palette.m3.onSurfaceVariant,
                    '&:hover': { bgcolor: theme.palette.m3.surfaceContainerHigh },
                    '@media (max-width: 640px)': { minWidth: 48, minHeight: 48, flexShrink: 0 },
                  })}
                >
                  <AppIcon name={session.protected ? 'lock' : 'key'} />
                  <span className="sr-only">{passwordLabel}</span>
                </IconButton>

                <Button
                  className="secondary-button new-address-button"
                  variant="outlined"
                  type="button"
                  data-action="new-address"
                  aria-expanded={createExpanded}
                  aria-controls="inbox-create-address"
                  onClick={() => setCreateExpanded((prev) => !prev)}
                  sx={(theme) => ({
                    ml: 0.5,
                    gap: 0.75,
                    '@media (max-width: 640px)': {
                      flexShrink: 0,
                      width: 56,
                      minWidth: 56,
                      height: 56,
                      minHeight: 56,
                      ml: 'auto',
                      p: 0,
                      border: 0,
                      borderRadius: '16px',
                      bgcolor: theme.palette.m3.primaryContainer,
                      color: theme.palette.m3.onPrimaryContainer,
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.18)',
                      '&:hover': {
                        border: 0,
                        bgcolor: theme.palette.m3.primaryContainer,
                      },
                    },
                  })}
                >
                  <AppIcon name={createExpanded ? 'x' : 'plus'} />
                  <Box
                    component="span"
                    className="new-address-label"
                    sx={{
                      '@media (max-width: 640px)': {
                        position: 'absolute',
                        width: 1,
                        height: 1,
                        overflow: 'hidden',
                        clip: 'rect(0, 0, 0, 0)',
                        whiteSpace: 'nowrap',
                      },
                    }}
                  >
                    {t('inbox.new')}
                  </Box>
                </Button>
              </Box>

              {session.accessKind === 'visitor' || session.accessKind === 'admin' ? (
                <IconButton
                  className="icon-button"
                  type="button"
                  data-action="mailbox-logout"
                  title={t('password.logout')}
                  aria-label={t('password.logout')}
                  onClick={onLogout}
                  sx={(theme) => ({
                    color: theme.palette.m3.onSurfaceVariant,
                    '&:hover': { bgcolor: theme.palette.m3.surfaceContainerHigh },
                  })}
                >
                  <AppIcon name="log-out" />
                  <span className="sr-only">{t('password.logout')}</span>
                </IconButton>
              ) : null}
            </Box>
          </Box>

          {notice ? (
            <Typography
              className="toolbar-notice"
              aria-live="polite"
              variant="body2"
              sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
            >
              {notice}
            </Typography>
          ) : null}

          <Box
            component="section"
            id="inbox-create-address"
            className="inbox-create"
            aria-labelledby="inbox-create-heading"
            style={{ display: createExpanded ? undefined : 'none' }}
            sx={(theme) => ({
              pt: 1.5,
              borderTop: `1px solid ${theme.palette.m3.outlineVariant}`,
              minWidth: 0,
            })}
          >
            <h2 id="inbox-create-heading" className="sr-only">
              {t('address.create')}
            </h2>

            {createLoadingDomains ? (
              <Box className="inbox-create-state" aria-live="polite">
                <Skeleton variant="rounded" width="100%" height={48} sx={{ borderRadius: '12px' }} />
                <span className="sr-only">{t('address.loading')}</span>
              </Box>
            ) : createDomainError ? (
              <Box
                className="inbox-create-state"
                role="alert"
                sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}
              >
                <Typography variant="body2" sx={(theme) => ({ color: theme.palette.error.main, m: 0 })}>
                  {createDomainError}
                </Typography>
                <Button
                  className="secondary-button compact-button"
                  variant="outlined"
                  type="button"
                  onClick={() => void loadCreateDomains()}
                >
                  {t('address.retry')}
                </Button>
              </Box>
            ) : !createDomains.length ? (
              <Box className="inbox-create-state">
                <Typography
                  variant="body2"
                  sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
                >
                  {t('address.noneHelp')}
                </Typography>
              </Box>
            ) : (
              <Box
                component="form"
                className="address-form"
                onSubmit={(event) => void handleSubmitCreate(event)}
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  gap: 1.5,
                  minWidth: 0,
                }}
              >
                <Box
                  className="address-fields"
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    gap: 1,
                    flex: '1 1 18rem',
                    minWidth: 0,
                  }}
                >
                  <Box
                    className="field local-field"
                    sx={{ display: 'grid', gap: 0.5, flex: '1 1 8rem', minWidth: 0 }}
                  >
                    <Box
                      component="label"
                      htmlFor="inbox-create-local-part"
                      sx={(theme) => ({
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: theme.palette.m3.onSurfaceVariant,
                      })}
                    >
                      {t('address.name')}
                    </Box>
                    <Box
                      component="input"
                      id="inbox-create-local-part"
                      name="inbox-create-local-part"
                      autoComplete="off"
                      autoCapitalize="none"
                      minLength={1}
                      maxLength={64}
                      pattern="[A-Za-z0-9](?:[A-Za-z0-9._+\-]*[A-Za-z0-9])?"
                      required
                      value={createLocalPart}
                      onChange={(event) => setCreateLocalPart(event.target.value)}
                      sx={(theme) => ({
                        width: '100%',
                        minWidth: 0,
                        minHeight: 44,
                        px: 1.5,
                        borderRadius: '12px',
                        border: `1px solid ${theme.palette.m3.outlineVariant}`,
                        bgcolor: theme.palette.m3.surfaceContainerLowest,
                        color: theme.palette.m3.onSurface,
                        fontFamily: MONO_FONT_FAMILY,
                        fontSize: '0.9375rem',
                      })}
                    />
                  </Box>

                  <Box
                    component="span"
                    className="at-sign"
                    aria-hidden="true"
                    sx={(theme) => ({
                      color: theme.palette.m3.onSurfaceVariant,
                      fontFamily: MONO_FONT_FAMILY,
                      fontWeight: 500,
                      pb: 1.25,
                    })}
                  >
                    @
                  </Box>

                  <Box
                    className="field domain-field"
                    sx={{ display: 'grid', gap: 0.5, flex: '1 1 9rem', minWidth: 0 }}
                  >
                    <Box
                      component="label"
                      htmlFor="inbox-create-domain"
                      sx={(theme) => ({
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: theme.palette.m3.onSurfaceVariant,
                      })}
                    >
                      {t('address.domain')}
                    </Box>
                    <Box
                      component="select"
                      id="inbox-create-domain"
                      name="inbox-create-domain"
                      required
                      value={createDomain}
                      onChange={(event) => setCreateDomain(event.target.value)}
                      sx={(theme) => ({
                        width: '100%',
                        minWidth: 0,
                        minHeight: 44,
                        px: 1.5,
                        borderRadius: '12px',
                        border: `1px solid ${theme.palette.m3.outlineVariant}`,
                        bgcolor: theme.palette.m3.surfaceContainerLowest,
                        color: theme.palette.m3.onSurface,
                        fontFamily: MONO_FONT_FAMILY,
                        fontSize: '0.9375rem',
                      })}
                    >
                      {createDomains.map((domain) => (
                        <option key={domain.id} value={domain.domain}>
                          {domain.domain}
                        </option>
                      ))}
                    </Box>
                  </Box>
                </Box>

                <Button
                  className="primary-button"
                  variant="contained"
                  type="submit"
                  disabled={createSubmitting || !createAddress}
                  startIcon={<AppIcon name="inbox" />}
                  sx={{ minHeight: 44 }}
                >
                  {createSubmitting ? t('address.opening') : t('address.open')}
                </Button>
                <Button
                  className="text-button"
                  variant="text"
                  type="button"
                  disabled={createSubmitting}
                  startIcon={<AppIcon name="shuffle" />}
                  onClick={() => void randomizeCreate()}
                  sx={{ minHeight: 44 }}
                >
                  {t('address.random')}
                </Button>
              </Box>
            )}
          </Box>
        </Paper>

        {latestCode ? (
          <Box
            component="section"
            className="latest-code"
            aria-label={t('inbox.latestCode')}
            sx={(theme) => ({
              display: 'flex',
              flex: '1 1 22rem',
              minWidth: 0,
              alignItems: 'center',
              gap: 2,
              px: { xs: 2, sm: 2.5 },
              py: 2,
              borderRadius: '28px',
              bgcolor: theme.palette.m3.tertiaryContainer,
              color: theme.palette.m3.onTertiaryContainer,
            })}
          >
            <Box className="latest-code-text" sx={{ display: 'grid', flex: 1, minWidth: 0, gap: 0.25 }}>
              <Box
                component="span"
                className="latest-code-label"
                sx={{
                  overflow: 'hidden',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  letterSpacing: '0.03em',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('inbox.latestCode')} · {latestCode.from}
              </Box>
              <Box
                component="code"
                className="latest-code-value"
                sx={{
                  fontFamily: MONO_FONT_FAMILY,
                  fontSize: 'clamp(1.5rem, 2.6vw, 1.875rem)',
                  fontWeight: 500,
                  letterSpacing: '0.12em',
                }}
              >
                {groupCode(latestCode.code)}
              </Box>
            </Box>
            <Button
              className="latest-code-copy"
              variant="contained"
              type="button"
              data-action="copy-latest-code"
              startIcon={<AppIcon name="copy" />}
              onClick={() => void copyAction(latestCode.code, 'inbox.codeCopied')}
              sx={(theme) => ({
                flexShrink: 0,
                minHeight: 48,
                px: { xs: 2, sm: 2.5 },
                bgcolor: theme.palette.m3.tertiary,
                color: theme.palette.m3.onTertiary,
                '&:hover': {
                  bgcolor: theme.palette.m3.tertiary,
                  opacity: 0.92,
                },
              })}
            >
              {t('inbox.copyLatestCode')}
            </Button>
          </Box>
        ) : null}
      </Box>

      <Box
        className="inbox-panes"
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(20rem, 27.5rem) minmax(0, 1fr)',
          alignItems: 'start',
          gap: 1.5,
          minWidth: 0,
          '@media (max-width: 952px)': {
            gridTemplateColumns: 'minmax(0, 1fr)',
          },
        }}
      >
        <Paper
          component="aside"
          className="panel message-list"
          aria-label={t('inbox.messages')}
          sx={(theme) => ({
            borderRadius: '28px',
            bgcolor: theme.palette.m3.surfaceContainerLow,
            color: theme.palette.m3.onSurface,
            minWidth: 0,
            overflow: 'hidden',
            '@media (max-width: 952px)': {
              display: selectedId ? 'none' : undefined,
            },
          })}
        >
          <Box
            className="list-heading"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 1.5,
              p: 2,
              pb: 1,
            }}
          >
            <Box className="field" sx={{ width: '100%', minWidth: 0 }}>
              <label className="sr-only" htmlFor="message-search">
                {t('inbox.searchLabel')}
              </label>
              <Box
                component="span"
                className="search-bar"
                sx={(theme) => ({
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 1.5,
                  minHeight: '3.5rem',
                  px: 2,
                  borderRadius: '9999px',
                  bgcolor: theme.palette.m3.surfaceContainerHigh,
                  color: theme.palette.m3.onSurfaceVariant,
                  '&:focus-within': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
                })}
              >
                <AppIcon name="search" />
                <Box
                  component="input"
                  id="message-search"
                  type="search"
                  placeholder={t('inbox.searchPlaceholder')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  sx={(theme) => ({
                    width: '100%',
                    minWidth: 0,
                    minHeight: 0,
                    p: 0,
                    border: 0,
                    bgcolor: 'transparent',
                    color: theme.palette.m3.onSurface,
                    font: 'inherit',
                    fontSize: '0.9375rem',
                    '&:focus-visible': { outline: 'none' },
                  })}
                />
              </Box>
            </Box>

            <Box
              className="list-heading-title"
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 1,
                px: 1,
              }}
            >
              <Typography
                ref={listHeadingRef}
                component="h2"
                tabIndex={-1}
                variant="subtitle2"
                sx={(theme) => ({
                  color: theme.palette.m3.onSurfaceVariant,
                  fontWeight: 500,
                  m: 0,
                })}
              >
                {t('inbox.messages')}
              </Typography>
              <Typography
                component="span"
                variant="caption"
                sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant })}
              >
                {t('inbox.total', { count: collection?.['hydra:totalItems'] ?? 0 })}
              </Typography>
            </Box>
          </Box>

          {loading ? (
            <Stack className="message-list-state" aria-live="polite" spacing={1.25} sx={{ p: 2 }}>
              <Skeleton variant="rounded" height={64} sx={{ borderRadius: '20px' }} />
              <Skeleton variant="rounded" height={64} sx={{ borderRadius: '20px' }} />
              <Skeleton variant="rounded" height={64} sx={{ borderRadius: '20px' }} />
              <span className="sr-only">{t('inbox.loading')}</span>
            </Stack>
          ) : error && !collection ? (
            <Box
              className="message-list-state"
              sx={{ display: 'grid', gap: 1, justifyItems: 'start', p: 3 }}
            >
              <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 500, m: 0 }}>
                {t('inbox.unavailable')}
              </Typography>
              <Typography
                variant="body2"
                sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
              >
                {error}
              </Typography>
              <Button
                className="secondary-button compact-button"
                variant="outlined"
                type="button"
                onClick={() => void refresh()}
              >
                {t('address.retry')}
              </Button>
            </Box>
          ) : query && pageMessages.length > 0 && !messages.length ? (
            <Box className="message-list-state" sx={{ p: 3, textAlign: 'center' }}>
              <Typography
                component="h3"
                variant="subtitle2"
                sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
              >
                {t('inbox.noSearchResults')}
              </Typography>
            </Box>
          ) : !messages.length ? (
            <Box className="message-list-state" sx={{ p: 3, textAlign: 'center', display: 'grid', gap: 0.75 }}>
              <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 500, m: 0 }}>
                {t('inbox.waiting')}
              </Typography>
              <Typography
                variant="body2"
                sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
              >
                {t('inbox.waitingHelp')}
              </Typography>
            </Box>
          ) : (
            <>
              {error ? (
                <Typography
                  className="list-error"
                  role="alert"
                  variant="body2"
                  sx={(theme) => ({ color: theme.palette.error.main, px: 2.5, py: 1, m: 0 })}
                >
                  {error}
                </Typography>
              ) : null}

              <Box
                component="ul"
                className="message-rows"
                sx={{
                  listStyle: 'none',
                  m: 0,
                  p: 1,
                  pt: 0,
                  display: 'grid',
                  gap: 0.25,
                }}
              >
                {messages.map((item) => {
                  const isSelected = item.id === selectedId
                  const rowCode = codeCache.get(item.id)
                  return (
                    <Box
                      component="li"
                      key={item.id}
                      className={isSelected ? 'message-row-item selected' : 'message-row-item'}
                      sx={(theme) => ({
                        display: 'flex',
                        alignItems: 'center',
                        pr: rowCode ? 1.5 : 0,
                        borderRadius: '20px',
                        bgcolor: isSelected ? theme.palette.m3.secondaryContainer : 'transparent',
                        color: isSelected
                          ? theme.palette.m3.onSecondaryContainer
                          : theme.palette.m3.onSurface,
                        transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1)',
                        '&:hover': isSelected
                          ? undefined
                          : { bgcolor: alpha(theme.palette.m3.onSurface, 0.06) },
                      })}
                    >
                      <Box
                        component="button"
                        className={!item.seen ? 'message-row unread' : 'message-row'}
                        data-message-id={item.id}
                        type="button"
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => setSelectedId(item.id)}
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          border: 0,
                          background: 'transparent',
                          color: 'inherit',
                          font: 'inherit',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'grid',
                          gridTemplateColumns: '2.5rem minmax(0, 1fr)',
                          columnGap: '0.875rem',
                          rowGap: '2px',
                          p: '0.875rem 0.75rem 0.875rem 1rem',
                          borderRadius: '20px',
                        }}
                      >
                        <Box
                          component="span"
                          className="message-avatar"
                          aria-hidden="true"
                          sx={(theme) => ({
                            display: 'grid',
                            gridRow: '1 / span 4',
                            width: '2.5rem',
                            height: '2.5rem',
                            placeItems: 'center',
                            borderRadius: '50%',
                            fontWeight: 500,
                            bgcolor: !item.seen
                              ? theme.palette.m3.primaryContainer
                              : theme.palette.m3.surfaceContainerHighest,
                            color: !item.seen
                              ? theme.palette.m3.onPrimaryContainer
                              : theme.palette.m3.onSurfaceVariant,
                          })}
                        >
                          {initial(item)}
                        </Box>

                        <Box
                          component="span"
                          className="message-row-top"
                          sx={{
                            gridColumn: 2,
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            gap: 1,
                            minWidth: 0,
                            '@media (max-width: 420px)': {
                              flexWrap: 'wrap',
                              rowGap: 0,
                            },
                          }}
                        >
                          <Box
                            component="strong"
                            sx={{
                              fontSize: '0.875rem',
                              fontWeight: !item.seen ? 600 : 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              minWidth: 0,
                            }}
                          >
                            {item.from.name || item.from.address}
                          </Box>
                          <Box
                            component="time"
                            dateTime={item.createdAt}
                            sx={(theme) => ({
                              fontSize: '0.75rem',
                              color: isSelected ? 'inherit' : theme.palette.m3.onSurfaceVariant,
                              opacity: isSelected ? 0.8 : 1,
                              flexShrink: 0,
                            })}
                          >
                            {formatDate(item.createdAt)}
                          </Box>
                        </Box>

                        {!item.seen ? (
                          <span className="sr-only">{t('inbox.unread')}</span>
                        ) : null}

                        <Box
                          component="span"
                          className="message-subject"
                          sx={{
                            gridColumn: 2,
                            fontSize: '0.875rem',
                            fontWeight: !item.seen ? 600 : 400,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.subject || t('inbox.noSubject')}
                        </Box>

                        <Box
                          component="span"
                          className="message-intro"
                          sx={(theme) => ({
                            gridColumn: 2,
                            fontSize: '0.8125rem',
                            color: isSelected ? 'inherit' : theme.palette.m3.onSurfaceVariant,
                            opacity: isSelected ? 0.8 : 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          })}
                        >
                          {item.intro || t('inbox.noPreview')}
                        </Box>

                        {item.hasAttachments ? (
                          <Box
                            component="span"
                            className="attachment-flag"
                            sx={(theme) => ({
                              gridColumn: 2,
                              display: 'inline-flex',
                              alignItems: 'center',
                              color: isSelected ? 'inherit' : theme.palette.m3.onSurfaceVariant,
                            })}
                          >
                            <AppIcon name="paperclip" />
                            <span className="sr-only">{t('inbox.attachment')}</span>
                          </Box>
                        ) : null}
                      </Box>

                      {rowCode ? (
                        <Box
                          component="button"
                          className="message-row-code"
                          type="button"
                          aria-label={t('inbox.copyCodeFor', { address: item.from.address })}
                          onClick={() => void copyAction(rowCode, 'inbox.codeCopied')}
                          sx={(theme) => ({
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.75,
                            flexShrink: 0,
                            minHeight: 44,
                            px: 1.25,
                            py: 0.75,
                            border: 0,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            bgcolor: theme.palette.m3.tertiaryContainer,
                            color: theme.palette.m3.onTertiaryContainer,
                            fontFamily: MONO_FONT_FAMILY,
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            '&:hover': {
                              bgcolor: alpha(theme.palette.m3.onTertiaryContainer, 0.1),
                              backgroundColor: theme.palette.m3.tertiaryContainer,
                              filter: 'brightness(0.95)',
                            },
                          })}
                        >
                          <span className="code-value">{rowCode}</span>
                          <AppIcon name="copy" />
                        </Box>
                      ) : null}
                    </Box>
                  )
                })}
              </Box>
            </>
          )}

          {canPrevious || canNext ? (
            <Box
              component="nav"
              className="pagination"
              aria-label={t('inbox.pages')}
              sx={(theme) => ({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                px: 2,
                py: 1.5,
                borderTop: `1px solid ${theme.palette.m3.outlineVariant}`,
              })}
            >
              <Button
                type="button"
                variant="outlined"
                size="small"
                disabled={!canPrevious}
                onClick={() => changePage(page - 1)}
              >
                {t('inbox.previous')}
              </Button>
              <Typography
                component="span"
                variant="body2"
                sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant })}
              >
                {t('inbox.page', { page })}
              </Typography>
              <Button
                type="button"
                variant="outlined"
                size="small"
                disabled={!canNext}
                onClick={() => changePage(page + 1)}
              >
                {t('inbox.next')}
              </Button>
            </Box>
          ) : null}
        </Paper>

        {selectedId ? (
          <MessageReader
            key={selectedId}
            messageId={selectedId}
            token={session.token}
            address={session.address}
            onSeen={markSeen}
            onDeleted={removeMessage}
            onStale={removeStale}
            onUnauthorized={invalidateAccess}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <Paper
            className="panel reader-placeholder"
            aria-hidden="true"
            sx={(theme) => ({
              display: 'grid',
              minHeight: '24rem',
              placeItems: 'center',
              borderRadius: '28px',
              bgcolor: theme.palette.m3.surfaceContainerLow,
              color: theme.palette.m3.outlineVariant,
              '@media (max-width: 952px)': {
                display: 'none',
              },
            })}
          >
            <AppIcon name="mail-open" sx={{ fontSize: '3rem' }} />
          </Paper>
        )}
      </Box>

      {showQrModal ? (
        <QrCodeModal address={session.address} onClose={() => setShowQrModal(false)} />
      ) : null}
    </Box>
  )
}

export default InboxView
