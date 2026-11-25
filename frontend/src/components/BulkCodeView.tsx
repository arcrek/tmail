import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import type { GridColDef } from '@mui/x-data-grid'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { downloadCsv } from '../csv'
import { getI18n, useI18n } from '../i18n'
import { authorizationFailed, openMailbox } from '../mailbox-access'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { loadSessions, removeSession } from '../session'
import { useToast } from '../toast'
import type { AddressSession } from '../types'
import { extractVerificationCode, groupCode } from '../verificationCode'
import { AppIcon } from './AppIcon'
import { TMailDataGrid } from './TMailDataGrid'

export interface BulkCodeViewProps {
  accessToken?: string
  fetchSeconds: number
}

interface BulkCodeRow {
  id: string
  address: string
  status: 'loading' | 'ready' | 'error' | 'locked'
  subject: string
  code: string
  error: string
  storedToken?: string
  version: number
}

const LOCKED_ADDRESS_LIMIT = 10
const ROW_CONCURRENCY = 6

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`

async function runBounded<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++]
      if (current !== undefined) await worker(current)
    }
  })
  await Promise.allSettled(runners)
}

export function BulkCodeView({ accessToken = '', fetchSeconds }: BulkCodeViewProps) {
  const { t } = useI18n()
  const toast = useToast()

  const [input, setInput] = useState('')
  const [rows, setRows] = useState<BulkCodeRow[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const rowsRef = useRef<BulkCodeRow[]>([])
  const tokenCacheRef = useRef(new Map<string, AddressSession>())
  const intervalRef = useRef<number | undefined>(undefined)
  const refreshVersionRef = useRef(0)
  const submitVersionRef = useRef(0)
  const refreshingRef = useRef(false)
  const mountedRef = useRef(true)
  const accessTokenRef = useRef(accessToken)
  const fetchSecondsRef = useRef(fetchSeconds)
  const prevAccessTokenRef = useRef(accessToken)
  const toastRef = useRef(toast)

  accessTokenRef.current = accessToken
  fetchSecondsRef.current = fetchSeconds
  toastRef.current = toast

  const isUnlocked = Boolean(accessToken)

  const parsedAddresses = useMemo(
    () => [
      ...new Set(
        input
          .split(/[\s,]+/)
          .map((address) => address.trim().toLowerCase())
          .filter(Boolean),
      ),
    ],
    [input],
  )

  const addresses = useMemo(
    () => (isUnlocked ? parsedAddresses : parsedAddresses.slice(0, LOCKED_ADDRESS_LIMIT)),
    [isUnlocked, parsedAddresses],
  )

  const partialCount = !isUnlocked && parsedAddresses.length > LOCKED_ADDRESS_LIMIT ? addresses.length : null

  const extractedCodes = useMemo(
    () => rows.map((row) => row.code).filter((code): code is string => Boolean(code)),
    [rows],
  )

  const syncRows = useCallback(() => {
    if (!mountedRef.current) return
    setRows(rowsRef.current.map((row) => ({ ...row })))
  }, [])

  const setRefreshingState = useCallback((next: boolean) => {
    refreshingRef.current = next
    if (mountedRef.current) setRefreshing(next)
  }, [])

  const fetchLatestMessage = useCallback(
    async (row: BulkCodeRow, version: number, rowVersion: number): Promise<{ subject: string; code: string }> => {
      let session = tokenCacheRef.current.get(row.address)
      if (!session) {
        session = await openMailbox(row.address, accessTokenRef.current || undefined)
        if (version !== submitVersionRef.current || rowVersion !== row.version) return { subject: '', code: '' }
        tokenCacheRef.current.set(row.address, session)
        row.storedToken = loadSessions().find((saved) => saved.address === row.address)?.token
      }
      const latest = (await api.messages(session.token, 1))['hydra:member'][0]
      if (version !== submitVersionRef.current || rowVersion !== row.version) return { subject: '', code: '' }
      if (!latest) return { subject: '', code: '' }
      const current = await api.message(session.token, latest.id)
      return {
        subject: current.subject,
        code: extractVerificationCode(current.subject, current.text, current.html),
      }
    },
    [],
  )

  // `silent` is used for background refreshes (poll ticks, manual Refresh): it skips the
  // loading-skeleton flip and leaves the previously-shown subject/code in place until the new
  // fetch actually resolves, instead of blanking an already-ready row on every cycle.
  const resolveRow = useCallback(
    async (row: BulkCodeRow, options: { silent?: boolean } = {}): Promise<void> => {
      const savedToken = loadSessions().find((saved) => saved.address === row.address)?.token
      if (row.status === 'locked' && (!savedToken || savedToken === row.storedToken)) return
      const version = submitVersionRef.current
      const rowVersion = (row.version = row.version + 1)
      row.storedToken = savedToken
      if (!options.silent) {
        row.status = 'loading'
        row.subject = ''
        row.code = ''
        row.error = ''
        syncRows()
      }
      try {
        const result = await fetchLatestMessage(row, version, rowVersion)
        if (version !== submitVersionRef.current || rowVersion !== row.version) return
        row.subject = result.subject
        row.code = result.code
        row.status = 'ready'
        row.error = ''
        syncRows()
      } catch (cause) {
        if (version !== submitVersionRef.current || rowVersion !== row.version) return
        row.subject = ''
        row.code = ''
        if (authorizationFailed(cause)) {
          const session = tokenCacheRef.current.get(row.address)
          if (session && loadSessions().find((saved) => saved.address === row.address)?.token === session.token) {
            removeSession(row.address)
          }
          tokenCacheRef.current.delete(row.address)
          row.status = 'locked'
          row.error = getI18n().t('password.locked')
        } else {
          row.status = 'error'
          row.error = cause instanceof ApiError ? cause.message : getI18n().t('bulkCode.rowError')
        }
        syncRows()
      }
    },
    [fetchLatestMessage, syncRows],
  )

  // Poll ticks (and resuming from a hidden tab) skip rows already in 'error' — an address that
  // failed token issuance would otherwise re-issue /token every interval, sharing the same
  // 10-req/60s budget as good rows. Manual Refresh is a deliberate one-off action, so it retries
  // error rows too (retryErrors).
  const refresh = useCallback(
    async (options: { retryErrors?: boolean } = {}): Promise<void> => {
      if (refreshingRef.current || rowsRef.current.length === 0) return
      const targets = options.retryErrors
        ? rowsRef.current
        : rowsRef.current.filter((row) => row.status !== 'error' && row.status !== 'locked')
      if (targets.length === 0) return
      const version = ++refreshVersionRef.current
      setRefreshingState(true)
      try {
        await runBounded(targets, ROW_CONCURRENCY, (row) => resolveRow(row, { silent: true }))
      } finally {
        if (version === refreshVersionRef.current) setRefreshingState(false)
      }
    },
    [resolveRow, setRefreshingState],
  )

  const manualRefresh = useCallback(() => {
    void refresh({ retryErrors: true })
  }, [refresh])

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== undefined) window.clearInterval(intervalRef.current)
    intervalRef.current = undefined
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    if (rowsRef.current.length && !document.hidden) {
      intervalRef.current = window.setInterval(
        () => void refresh(),
        Math.max(1, fetchSecondsRef.current) * 1000,
      )
    }
  }, [refresh, stopPolling])

  const handleVisibility = useCallback(() => {
    if (document.hidden) {
      stopPolling()
    } else {
      void refresh()
      startPolling()
    }
  }, [refresh, startPolling, stopPolling])

  const handleStorage = useCallback(
    (event: StorageEvent) => {
      if (event.key !== 'tmail.addresses' && event.key !== null) return
      let changed = false
      for (const row of rowsRef.current) {
        const session = tokenCacheRef.current.get(row.address)
        if (session?.accessKind === 'public' || session?.accessKind === 'admin') continue
        const saved = loadSessions().find((item) => item.address === row.address)
        if (saved?.token === row.storedToken) continue
        row.version = row.version + 1
        tokenCacheRef.current.delete(row.address)
        row.status = 'locked'
        row.subject = ''
        row.code = ''
        row.error = getI18n().t('password.locked')
        changed = true
        if (saved) void resolveRow(row)
      }
      if (changed) syncRows()
    },
    [resolveRow, syncRows],
  )

  useEffect(() => {
    mountedRef.current = true
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      mountedRef.current = false
      refreshVersionRef.current += 1
      submitVersionRef.current += 1
      tokenCacheRef.current.clear()
      stopPolling()
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [handleStorage, handleVisibility, stopPolling])

  useEffect(() => {
    startPolling()
  }, [fetchSeconds, startPolling])

  useEffect(() => {
    if (prevAccessTokenRef.current === accessToken) return
    prevAccessTokenRef.current = accessToken
    refreshVersionRef.current += 1
    submitVersionRef.current += 1
    stopPolling()
    tokenCacheRef.current.clear()
    rowsRef.current = []
    refreshingRef.current = false
    setRows([])
    setRefreshing(false)
  }, [accessToken, stopPolling])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      stopPolling()
      const version = ++submitVersionRef.current
      tokenCacheRef.current.clear()
      refreshVersionRef.current += 1
      const submittedRows: BulkCodeRow[] = addresses.map((address) => ({
        id: address,
        address,
        status: 'loading',
        subject: '',
        code: '',
        error: '',
        version: 0,
      }))
      rowsRef.current = submittedRows
      syncRows()
      setRefreshingState(true)
      try {
        await runBounded(submittedRows, ROW_CONCURRENCY, (row) => resolveRow(row))
      } finally {
        if (version === submitVersionRef.current) setRefreshingState(false)
      }
      if (version === submitVersionRef.current) startPolling()
    },
    [addresses, resolveRow, setRefreshingState, startPolling, stopPolling, syncRows],
  )

  const retryRow = useCallback(
    (address: string) => {
      const liveRow = rowsRef.current.find((row) => row.address === address)
      if (liveRow) void resolveRow(liveRow)
    },
    [resolveRow],
  )

  const copy = useCallback(
    async (value: string, notice: 'bulkCode.codeCopied' | 'bulkCode.emailCopied' | 'bulkCode.allCodesCopied') => {
      try {
        await copyText(value)
        toastRef.current.success(getI18n().t(notice))
      } catch {
        toastRef.current.error(getI18n().t('error.copy'))
      }
    },
    [],
  )

  const copyAllCodes = useCallback(async () => {
    if (!extractedCodes.length) return
    await copy(extractedCodes.join('\n'), 'bulkCode.allCodesCopied')
  }, [copy, extractedCodes])

  const exportCsv = useCallback(() => {
    if (!rows.length) return
    const header = 'address,subject,code,status,error\n'
    const csvRows = rows
      .map((r) => {
        const safe = (str: string | undefined) => `"${(str ?? '').replace(/"/g, '""')}"`
        return `${safe(r.address)},${safe(r.subject)},${safe(r.code)},${safe(r.status)},${safe(r.error)}`
      })
      .join('\n')
    downloadCsv('tmail-codes.csv', header + csvRows + '\n')
  }, [rows])

  const columns = useMemo<GridColDef<BulkCodeRow>[]>(
    () => [
      {
        field: 'address',
        headerName: t('bulkCode.email'),
        flex: 1,
        minWidth: 220,
        cellClassName: 'tmail-mono-cell',
        renderCell: (params) => {
          const address = params.row.address
          return (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ width: '100%', minWidth: 0, alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Link
                href={`/${encodeURIComponent(address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="saved-address"
                underline="hover"
                sx={{
                  fontFamily: MONO_FONT_FAMILY,
                  fontSize: '0.84rem',
                  color: (theme) => theme.palette.primary.main,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {address}
              </Link>
              <Tooltip title={t('bulkCode.copyEmailFor', { address })}>
                <IconButton
                  className="row-icon-button"
                  type="button"
                  size="small"
                  aria-label={t('bulkCode.copyEmailFor', { address })}
                  onClick={() => void copy(address, 'bulkCode.emailCopied')}
                  sx={{
                    flexShrink: 0,
                    color: (theme) => theme.palette.m3.onSurfaceVariant,
                    '&:hover': {
                      bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
                    },
                  }}
                >
                  <AppIcon name="copy" />
                </IconButton>
              </Tooltip>
            </Stack>
          )
        },
      },
      {
        field: 'subject',
        headerName: t('bulkCode.subject'),
        flex: 1.2,
        minWidth: 220,
        renderCell: (params) => {
          const row = params.row
          if (row.status === 'loading') {
            return (
              <Box
                aria-live="polite"
                data-loading-cell="true"
                sx={{ display: 'flex', alignItems: 'center', width: '100%', py: 0.5 }}
              >
                <Skeleton variant="text" width={160} height={22} className="skeleton skeleton-label" />
                <span className="sr-only">{t('bulkCode.loading')}</span>
              </Box>
            )
          }
          if (row.status === 'locked') {
            return (
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75, py: 0.5 }}
              >
                <Chip
                  role="alert"
                  size="small"
                  icon={<AppIcon name="lock" sx={{ color: 'inherit !important' }} />}
                  label={row.error || t('password.locked')}
                  sx={{
                    bgcolor: (theme) => theme.palette.m3.warningContainer,
                    color: (theme) => theme.palette.m3.onWarningContainer,
                    height: 'auto',
                    minHeight: 28,
                    '& .MuiChip-label': {
                      whiteSpace: 'normal',
                      py: 0.25,
                    },
                  }}
                />
                <Link
                  href={`/${encodeURIComponent(row.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-action="open-mailbox-login"
                  underline="hover"
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: (theme) => theme.palette.primary.main,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('password.open')}
                </Link>
              </Stack>
            )
          }
          if (row.status === 'error') {
            return (
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75, py: 0.5 }}
              >
                <Chip
                  role="alert"
                  size="small"
                  icon={<AppIcon name="alert-triangle" sx={{ color: 'inherit !important' }} />}
                  label={row.error || t('bulkCode.rowError')}
                  sx={{
                    bgcolor: (theme) => theme.palette.m3.errorContainer,
                    color: (theme) => theme.palette.m3.onErrorContainer,
                    height: 'auto',
                    minHeight: 28,
                    '& .MuiChip-label': {
                      whiteSpace: 'normal',
                      py: 0.25,
                    },
                  }}
                />
                <Button
                  className="text-button"
                  type="button"
                  size="small"
                  variant="text"
                  onClick={() => retryRow(row.address)}
                  sx={{ minHeight: 32, px: 1.25 }}
                >
                  {t('address.retry')}
                </Button>
              </Stack>
            )
          }
          return (
            <Typography
              variant="body2"
              sx={{
                color: (theme) => (row.subject ? theme.palette.m3.onSurface : theme.palette.m3.onSurfaceVariant),
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                py: 0.5,
              }}
            >
              {row.subject || t('bulkCode.noSubject')}
            </Typography>
          )
        },
      },
      {
        field: 'code',
        headerName: t('bulkCode.code'),
        flex: 0.9,
        minWidth: 210,
        renderCell: (params) => {
          const row = params.row
          if (row.status === 'loading') {
            return (
              <Skeleton
                variant="rounded"
                width={108}
                height={30}
                className="skeleton skeleton-label"
                sx={{ borderRadius: '8px' }}
              />
            )
          }
          if (!row.code) {
            return (
              <Typography
                variant="body2"
                sx={{ color: (theme) => theme.palette.m3.onSurfaceVariant }}
              >
                {t('bulkCode.noCode')}
              </Typography>
            )
          }
          return (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Chip
                className="verification-code-chip"
                label={groupCode(row.code)}
                size="small"
                sx={{
                  bgcolor: (theme) => theme.palette.m3.tertiaryContainer,
                  color: (theme) => theme.palette.m3.onTertiaryContainer,
                  fontFamily: MONO_FONT_FAMILY,
                  fontWeight: 500,
                  letterSpacing: '0.12em',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  height: 32,
                }}
              />
              <Button
                className="text-button"
                type="button"
                size="small"
                variant="contained"
                aria-label={t('bulkCode.copyCodeFor', { address: row.address })}
                startIcon={<AppIcon name="copy" />}
                onClick={() => void copy(row.code, 'bulkCode.codeCopied')}
                sx={{
                  bgcolor: (theme) => theme.palette.m3.tertiary,
                  color: (theme) => theme.palette.m3.onTertiary,
                  minHeight: 34,
                  px: 1.5,
                  '&:hover': {
                    bgcolor: (theme) => theme.palette.m3.tertiary,
                    opacity: 0.92,
                  },
                }}
              >
                {t('bulkCode.copyCode')}
              </Button>
            </Stack>
          )
        },
      },
    ],
    [copy, retryRow, t],
  )

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Box component="header" className="page-header" sx={{ mb: 2.5 }}>
        <Typography
          id="bulk-code-title"
          component="h1"
          variant="h4"
          sx={{
            fontSize: { xs: '1.5rem', sm: '2rem' },
            fontWeight: 500,
            color: (theme) => theme.palette.m3.onSurface,
            mb: 0.75,
          }}
        >
          {t('bulkCode.title')}
        </Typography>
        <Typography
          className="lede"
          variant="body1"
          sx={{ color: (theme) => theme.palette.m3.onSurfaceVariant }}
        >
          {t(isUnlocked ? 'bulkCode.ledeUnlocked' : 'bulkCode.lede')}
        </Typography>
      </Box>

      <Card
        component="section"
        className="panel bulk-panel bulk-code-panel"
        aria-labelledby="bulk-code-title"
        sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}
      >
        <Box
          component="form"
          className="bulk-controls bulk-code-form"
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2.5 }}
        >
          <TextField
            id="bulk-code-addresses"
            label={t('bulkCode.addresses')}
            multiline
            rows={6}
            fullWidth
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('bulkCode.placeholder')}
            slotProps={{
              htmlInput: {
                spellCheck: false,
                autoCapitalize: 'none',
                style: { fontFamily: MONO_FONT_FAMILY, fontSize: '0.875rem' },
              },
            }}
          />

          <Stack
            direction="row"
            spacing={1.25}
            className="bulk-form-actions"
            sx={{ flexWrap: 'wrap', rowGap: 1.25 }}
          >
            <Button
              className="primary-button"
              type="submit"
              variant="contained"
              disabled={addresses.length === 0}
              startIcon={<AppIcon name="scan-code" />}
            >
              {t('bulkCode.submit')}
            </Button>

            {rows.length > 0 && (
              <>
                <Button
                  className="secondary-button"
                  type="button"
                  variant="contained"
                  data-action="refresh"
                  disabled={refreshing}
                  onClick={manualRefresh}
                  startIcon={
                    <AppIcon
                      name="refresh-cw"
                      className={refreshing ? 'spinning' : undefined}
                      sx={
                        refreshing
                          ? {
                              animation: `${spin} 1s linear infinite`,
                              '@media (prefers-reduced-motion: reduce)': {
                                animation: 'none',
                              },
                            }
                          : undefined
                      }
                    />
                  }
                  sx={{
                    bgcolor: (theme) => theme.palette.m3.secondaryContainer,
                    color: (theme) => theme.palette.m3.onSecondaryContainer,
                    '&:hover': {
                      bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
                    },
                  }}
                >
                  {refreshing ? t('bulkCode.refreshing') : t('bulkCode.refresh')}
                </Button>

                <Button
                  className="secondary-button bulk-copy-all"
                  type="button"
                  variant="contained"
                  disabled={extractedCodes.length === 0}
                  onClick={() => void copyAllCodes()}
                  startIcon={<AppIcon name="copy" />}
                  sx={{
                    bgcolor: (theme) => theme.palette.m3.secondaryContainer,
                    color: (theme) => theme.palette.m3.onSecondaryContainer,
                    '&:hover': {
                      bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
                    },
                  }}
                >
                  {t('bulkCode.copyAll')}
                </Button>

                <Button
                  className="secondary-button bulk-export-csv"
                  type="button"
                  variant="contained"
                  onClick={exportCsv}
                  startIcon={<AppIcon name="download" />}
                  sx={{
                    bgcolor: (theme) => theme.palette.m3.secondaryContainer,
                    color: (theme) => theme.palette.m3.onSecondaryContainer,
                    '&:hover': {
                      bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
                    },
                  }}
                >
                  {t('bulkCode.exportCsv')}
                </Button>
              </>
            )}
          </Stack>
        </Box>

        {partialCount !== null && (
          <Box
            className="bulk-partial"
            role="status"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1.25,
              mb: 2,
              borderRadius: '12px',
              bgcolor: (theme) => theme.palette.m3.warningContainer,
              color: (theme) => theme.palette.m3.onWarningContainer,
            }}
          >
            <AppIcon name="alert-triangle" />
            <Typography variant="body2" sx={{ color: 'inherit', fontWeight: 500 }}>
              {t('bulkCode.partial', { count: partialCount })}
            </Typography>
          </Box>
        )}

        {rows.length > 0 ? (
          <Box className="bulk-results" aria-live="polite" sx={{ minWidth: 0 }}>
            <TMailDataGrid<BulkCodeRow>
              rows={rows}
              columns={columns}
              minWidth={650}
              ariaLabel={t('bulkCode.title')}
              getRowHeight={() => 'auto'}
              pageSizeOptions={[10, 25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25, page: 0 } },
              }}
              hideFooter={rows.length <= 25}
            />
          </Box>
        ) : (
          <Typography
            className="empty-copy"
            variant="body2"
            sx={{ color: (theme) => theme.palette.m3.onSurfaceVariant }}
          >
            {t('bulkCode.empty')}
          </Typography>
        )}
      </Card>
    </Box>
  )
}

export default BulkCodeView
