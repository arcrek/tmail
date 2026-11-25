import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import type { GridColDef } from '@mui/x-data-grid'
import { api } from '../api'
import { AppIcon } from '../components/AppIcon'
import { TMailDataGrid } from '../components/TMailDataGrid'
import { useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import type { DashboardResource } from '../types'

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

export const AUTO_SYNC_OVERDUE_MS = 24 * 60 * 60 * 1000

export interface DashboardTabProps {
  onAttention?: (count: number) => void
  onOpenDomains?: () => void
}

interface MxFailureRow {
  id: string
  domain: string
  kind: string
  detail: string | null
  created_at: string
}

export function DashboardTab({ onAttention, onOpenDomains }: DashboardTabProps) {
  const [dashboard, setDashboard] = useState<DashboardResource | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // True only while the latest request succeeded; a failed refresh must not keep claiming a live mail server.
  const [connected, setConnected] = useState(false)
  const { t, locale, formatDate, formatNumber } = useI18n()

  const requestVersion = useRef(0)
  const onAttentionRef = useRef(onAttention)
  onAttentionRef.current = onAttention
  const tRef = useRef(t)
  tRef.current = t

  const mxFailures24h = dashboard?.domains.mxFailures24h ?? 0

  const relativeTime = useCallback(
    (value: string): string => {
      const at = Date.parse(value)
      if (!Number.isFinite(at)) return value
      const seconds = Math.round((at - (loadedAt?.valueOf() ?? Date.now())) / 1000)
      const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
      const abs = Math.abs(seconds)
      if (abs < 60) return format.format(seconds, 'second')
      if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute')
      if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour')
      return format.format(Math.round(seconds / 86400), 'day')
    },
    [loadedAt, locale],
  )

  const sync = useMemo(() => {
    const last = dashboard?.lastSync
    if (!last?.created_at) return { state: 'never' as const, label: t('dashboard.syncNever') }
    if (last.success === false) return { state: 'failed' as const, label: t('dashboard.syncFailed') }
    const lastMs = Date.parse(last.created_at)
    const nowMs = loadedAt?.valueOf() ?? Date.now()
    if (dashboard?.autoSyncDomains && Number.isFinite(lastMs) && nowMs - lastMs >= AUTO_SYNC_OVERDUE_MS) {
      return { state: 'overdue' as const, label: t('dashboard.syncOverdue', { time: relativeTime(last.created_at) }) }
    }
    return { state: 'ok' as const, label: t('dashboard.syncOk', { time: relativeTime(last.created_at) }) }
  }, [dashboard, loadedAt, relativeTime, t])

  const failureKind = useCallback(
    (kind: string): string => tRef.current(kind === 'mx_mismatch' ? 'dashboard.mxMismatch' : 'dashboard.mxLookupError'),
    [],
  )

  const refresh = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current
    setLoading(true)
    setError('')
    try {
      const data = await api.admin.dashboard()
      if (version !== requestVersion.current) return
      setDashboard(data)
      setLoadedAt(new Date())
      setConnected(true)
      onAttentionRef.current?.(data.domains.mxFailures24h ?? 0)
    } catch (cause) {
      if (version !== requestVersion.current) return
      setConnected(false)
      setError(cause instanceof Error ? cause.message : tRef.current('error.dashboard'))
    } finally {
      if (version === requestVersion.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      requestVersion.current += 1
    }
  }, [refresh])

  const mxRows = useMemo<MxFailureRow[]>(
    () =>
      (dashboard?.domains.recentMxFailures ?? []).map((failure, index) => ({
        id: `${index}-${failure.created_at}-${failure.domain}-${failure.kind}`,
        domain: failure.domain,
        kind: failure.kind,
        detail: failure.detail,
        created_at: failure.created_at,
      })),
    [dashboard],
  )

  const mxColumns = useMemo<GridColDef<MxFailureRow>[]>(
    () => [
      {
        field: 'domain',
        headerName: t('dashboard.colDomain'),
        flex: 1.2,
        minWidth: 180,
        cellClassName: 'tmail-mono-cell',
      },
      {
        field: 'kind',
        headerName: t('dashboard.colKind'),
        flex: 1,
        minWidth: 190,
        valueGetter: (_value, row) => failureKind(row.kind),
        renderCell: (params) => {
          const isMismatch = params.row.kind === 'mx_mismatch'
          return (
            <Chip
              size="small"
              icon={<AppIcon name="alert-triangle" sx={{ fontSize: '1rem' }} />}
              label={failureKind(params.row.kind)}
              title={params.row.detail || undefined}
              className={isMismatch ? 'mx-failure-badge badge-amber' : 'mx-failure-badge badge-red'}
              sx={(theme) => ({
                bgcolor: isMismatch ? theme.palette.m3.warningContainer : theme.palette.m3.errorContainer,
                color: isMismatch ? theme.palette.m3.onWarningContainer : theme.palette.m3.onErrorContainer,
                '& .MuiChip-icon': { color: 'inherit' },
              })}
            />
          )
        },
      },
      {
        field: 'created_at',
        headerName: t('dashboard.colTime'),
        flex: 1,
        minWidth: 170,
        cellClassName: 'tmail-mono-cell',
        renderCell: (params) => (
          <Box component="time" dateTime={params.row.created_at} sx={{ fontFamily: MONO_FONT_FAMILY }}>
            {formatDate(params.row.created_at, { dateStyle: 'medium', timeStyle: 'short' })}
          </Box>
        ),
      },
    ],
    [failureKind, formatDate, t],
  )

  return (
    <Box
      component="section"
      className="admin-section dashboard"
      aria-labelledby="dashboard-title"
      sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
    >
      <Box
        className="admin-section-heading"
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box className="admin-title-block" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography
            id="dashboard-title"
            component="h1"
            variant="h4"
            sx={{ fontSize: '2rem', fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.2 }}
          >
            {t('admin.dashboard')}
          </Typography>
          {loadedAt && (
            <Typography component="span" variant="body2" color="text.secondary" className="admin-subtitle">
              {t('dashboard.updatedAt', { time: formatDate(loadedAt.toISOString(), { timeStyle: 'short' }) })}
            </Typography>
          )}
        </Box>
        <Button
          className="tonal-button"
          type="button"
          variant="contained"
          color="secondary"
          disabled={loading}
          onClick={() => { void refresh() }}
          startIcon={
            <AppIcon
              name="refresh-cw"
              className={loading ? 'spinning' : undefined}
              sx={loading ? { animation: `${spin} 1s linear infinite` } : undefined}
            />
          }
          sx={(theme) => ({
            bgcolor: theme.palette.m3.secondaryContainer,
            color: theme.palette.m3.onSecondaryContainer,
            '&:hover': { bgcolor: theme.palette.m3.secondaryContainer, filter: 'brightness(0.96)' },
          })}
        >
          {loading ? t('inbox.refreshing') : t('inbox.refresh')}
        </Button>
      </Box>

      {loading && !dashboard ? (
        <Box
          className="metric-grid"
          aria-live="polite"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          {[1, 2, 3].map((index) => (
            <Skeleton
              key={index}
              variant="rounded"
              height={116}
              className="skeleton metric-skeleton"
              sx={{ borderRadius: '28px' }}
            />
          ))}
          <span className="sr-only">{t('dashboard.loading')}</span>
        </Box>
      ) : dashboard ? (
        <>
          <Box
            component="ul"
            className="status-chips"
            aria-label={t('dashboard.status')}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              listStyle: 'none',
              p: 0,
              m: 0,
            }}
          >
            <Box
              component="li"
              className={connected ? 'status-chip' : 'status-chip status-chip-error'}
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                minHeight: 32,
                px: 1.5,
                py: 0.5,
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
                bgcolor: connected ? theme.palette.m3.surfaceContainerLow : theme.palette.m3.errorContainer,
                color: connected ? theme.palette.m3.onSurface : theme.palette.m3.onErrorContainer,
                border: `1px solid ${connected ? theme.palette.m3.outlineVariant : 'transparent'}`,
              })}
            >
              <AppIcon
                name={connected ? 'check' : 'alert-triangle'}
                className={connected ? 'status-ok' : undefined}
                sx={(theme) => ({ color: connected ? theme.palette.m3.success : 'inherit' })}
              />
              {connected ? t('dashboard.mailConnected') : t('dashboard.mailUnreachable')}
            </Box>
            <Box
              component="li"
              className={
                sync.state === 'failed'
                  ? 'status-chip status-chip-error'
                  : sync.state === 'overdue'
                    ? 'status-chip status-chip-warning'
                    : 'status-chip'
              }
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                minHeight: 32,
                px: 1.5,
                py: 0.5,
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
                bgcolor:
                  sync.state === 'failed'
                    ? theme.palette.m3.errorContainer
                    : sync.state === 'overdue'
                      ? theme.palette.m3.warningContainer
                      : theme.palette.m3.surfaceContainerLow,
                color:
                  sync.state === 'failed'
                    ? theme.palette.m3.onErrorContainer
                    : sync.state === 'overdue'
                      ? theme.palette.m3.onWarningContainer
                      : theme.palette.m3.onSurface,
                border: `1px solid ${
                  sync.state === 'failed' || sync.state === 'overdue'
                    ? 'transparent'
                    : theme.palette.m3.outlineVariant
                }`,
              })}
            >
              <AppIcon
                name={sync.state === 'ok' ? 'check' : 'alert-triangle'}
                className={sync.state === 'ok' ? 'status-ok' : undefined}
                sx={(theme) => ({
                  color:
                    sync.state === 'ok'
                      ? theme.palette.m3.success
                      : sync.state === 'failed' || sync.state === 'overdue'
                        ? 'inherit'
                        : theme.palette.m3.warning,
                })}
              />
              {sync.label}
            </Box>
            <Box
              component="li"
              className={mxFailures24h ? 'status-chip status-chip-error' : 'status-chip'}
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                minHeight: 32,
                px: 1.5,
                py: 0.5,
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
                bgcolor: mxFailures24h ? theme.palette.m3.errorContainer : theme.palette.m3.surfaceContainerLow,
                color: mxFailures24h ? theme.palette.m3.onErrorContainer : theme.palette.m3.onSurface,
                border: `1px solid ${mxFailures24h ? 'transparent' : theme.palette.m3.outlineVariant}`,
              })}
            >
              <AppIcon
                name={mxFailures24h ? 'alert-triangle' : 'check'}
                className={!mxFailures24h ? 'status-ok' : undefined}
                sx={(theme) => ({ color: !mxFailures24h ? theme.palette.m3.success : 'inherit' })}
              />
              {mxFailures24h
                ? t('dashboard.mxErrors24h', { count: formatNumber(mxFailures24h) })
                : t('dashboard.mxClear24h')}
            </Box>
          </Box>

          <Box
            className="kpi-cards"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            <Card
              component="section"
              className="kpi-card"
              aria-labelledby="kpi-mail-title"
              sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}
            >
              <Stack direction="row" spacing={1.5} className="kpi-card-heading" sx={{ alignItems: 'center' }}>
                <Box
                  component="span"
                  className="kpi-icon kpi-icon-primary"
                  aria-hidden="true"
                  sx={(theme) => ({
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '14px',
                    bgcolor: theme.palette.m3.primaryContainer,
                    color: theme.palette.m3.onPrimaryContainer,
                  })}
                >
                  <AppIcon name="mail" />
                </Box>
                <Typography id="kpi-mail-title" component="h2" variant="h6" sx={{ fontWeight: 500 }}>
                  {t('dashboard.mailCard')}
                </Typography>
              </Stack>
              <Box
                component="dl"
                className="kpi-stats"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 1.5,
                  m: 0,
                  '& dt': {
                    fontSize: '0.8125rem',
                    color: 'text.secondary',
                    fontWeight: 500,
                    mb: 0.5,
                  },
                  '& dd': {
                    m: 0,
                    fontSize: '1.625rem',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.2,
                  },
                }}
              >
                <div>
                  <dt>{t('dashboard.stored')}</dt>
                  <dd>{formatNumber(dashboard.messages.stored)}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.today')}</dt>
                  <dd>{formatNumber(dashboard.messages.today)}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.week')}</dt>
                  <dd>{formatNumber(dashboard.messages.sevenDays)}</dd>
                </div>
              </Box>
            </Card>

            <Card
              component="section"
              className="kpi-card"
              aria-labelledby="kpi-domain-title"
              sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}
            >
              <Stack direction="row" spacing={1.5} className="kpi-card-heading" sx={{ alignItems: 'center' }}>
                <Box
                  component="span"
                  className="kpi-icon kpi-icon-secondary"
                  aria-hidden="true"
                  sx={(theme) => ({
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '14px',
                    bgcolor: theme.palette.m3.secondaryContainer,
                    color: theme.palette.m3.onSecondaryContainer,
                  })}
                >
                  <AppIcon name="globe" />
                </Box>
                <Typography id="kpi-domain-title" component="h2" variant="h6" sx={{ fontWeight: 500 }}>
                  {t('dashboard.domainCard')}
                </Typography>
              </Stack>
              <Box
                component="dl"
                className="kpi-stats"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 1.5,
                  m: 0,
                  '& dt': {
                    fontSize: '0.8125rem',
                    color: 'text.secondary',
                    fontWeight: 500,
                    mb: 0.5,
                  },
                  '& dd': {
                    m: 0,
                    fontSize: '1.625rem',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.2,
                  },
                }}
              >
                <div>
                  <dt>{t('dashboard.domainsActive')}</dt>
                  <dd>{formatNumber(dashboard.domains.active)}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.domainsToday')}</dt>
                  <dd>{formatNumber(dashboard.domains.domainsToday)}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.domainsWeek')}</dt>
                  <dd>{formatNumber(dashboard.domains.domainsSevenDays)}</dd>
                </div>
              </Box>
            </Card>
          </Box>

          <Card
            component="section"
            className="mx-failures-panel"
            aria-labelledby="mx-failures-title"
            sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <Stack
              direction="row"
              className="mx-failures-header"
              sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}
            >
              <Typography id="mx-failures-title" component="h2" variant="h6" sx={{ fontWeight: 500 }}>
                {t('dashboard.mxFailures')}
              </Typography>
              <Button variant="text" className="text-button" type="button" onClick={onOpenDomains}>
                {t('dashboard.viewDomains')}
              </Button>
            </Stack>

            {mxRows.length > 0 ? (
              <TMailDataGrid<MxFailureRow>
                rows={mxRows}
                columns={mxColumns}
                ariaLabel={t('dashboard.mxFailures')}
                minWidth={540}
                hideFooter={mxRows.length <= 10}
              />
            ) : (
              <Stack
                direction="row"
                spacing={1}
                className="mx-empty-state"
                sx={{ alignItems: 'center', py: 1.5, color: 'text.secondary' }}
              >
                <AppIcon
                  name="check-circle"
                  className="empty-check-icon"
                  sx={(theme) => ({ color: theme.palette.m3.success })}
                />
                <Typography component="span" variant="body2">
                  {t('dashboard.mxFailuresEmpty')}
                </Typography>
              </Stack>
            )}
          </Card>
        </>
      ) : null}

      {error && (
        <Alert severity="error" role="alert" className="dashboard-error" sx={{ borderRadius: '16px' }}>
          {error}
        </Alert>
      )}
    </Box>
  )
}

export default DashboardTab
