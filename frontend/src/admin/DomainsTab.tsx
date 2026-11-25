import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { keyframes } from '@mui/material/styles'
import type { GridColDef } from '@mui/x-data-grid'
import { ApiError, api } from '../api'
import { AppIcon } from '../components/AppIcon'
import { TMailDataGrid } from '../components/TMailDataGrid'
import { useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { toastActions } from '../toast'
import type { AdminSettings, AdminSiteSettings, MxFailureDomain, SyncStatus } from '../types'

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

export interface DomainsTabProps {
  site: AdminSiteSettings
  domains: string[]
  lastSync: SyncStatus
  lastSuccessfulSync: SyncStatus
  lastSyncError: SyncStatus
  csrf: string
  onUpdated?: (settings: AdminSettings) => void
  onBusyChange?: (busy: boolean) => void
  onSynced?: (domains: string[], lastSync: SyncStatus) => void
  onAttention?: (count: number) => void
}

interface DomainsDraft {
  autoSyncDomains: boolean
  fetchSeconds: number
  messageLimit: number
  localPartMin: number
  localPartMax: number
  forbiddenIds: string
  blockedSenderDomains: string
  blacklistedDomains: string
}

interface DomainRow {
  id: string
  domain: string
}

function siteToDraft(site: AdminSiteSettings): DomainsDraft {
  return {
    autoSyncDomains: site.autoSyncDomains,
    fetchSeconds: site.fetchSeconds,
    messageLimit: site.messageLimit,
    localPartMin: site.localPartMin,
    localPartMax: site.localPartMax,
    forbiddenIds: site.forbiddenIds.join('\n'),
    blockedSenderDomains: site.blockedSenderDomains.join('\n'),
    blacklistedDomains: site.blacklistedDomains.join('\n'),
  }
}

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function DomainsTab({
  site,
  domains,
  lastSync,
  lastSuccessfulSync,
  lastSyncError,
  csrf,
  onUpdated,
  onBusyChange,
  onSynced,
  onAttention,
}: DomainsTabProps) {
  const [draft, setDraft] = useState<DomainsDraft>(() => siteToDraft(site))
  const [manualDomain, setManualDomain] = useState('')
  const [displayedDomains, setDisplayedDomains] = useState<string[]>(() => [...domains])
  const [displayedSync, setDisplayedSync] = useState<SyncStatus>(() => ({ ...lastSync }))
  const [displayedSuccessfulSync, setDisplayedSuccessfulSync] = useState<SyncStatus>(() => ({ ...lastSuccessfulSync }))
  const [displayedSyncError, setDisplayedSyncError] = useState<SyncStatus>(() => ({ ...lastSyncError }))
  const [pending, setPending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [mxFailures, setMxFailures] = useState<MxFailureDomain[]>([])
  const [mxFailures24h, setMxFailures24h] = useState(0)
  const [loadingMxFailures, setLoadingMxFailures] = useState(false)
  const [mxFailuresError, setMxFailuresError] = useState('')

  const busyRef = useRef(false)
  const onBusyRef = useRef(onBusyChange)
  onBusyRef.current = onBusyChange
  const onAttentionRef = useRef(onAttention)
  onAttentionRef.current = onAttention
  const mxLoadVersionRef = useRef(0)

  const { t, formatDate, formatNumber } = useI18n()
  const tRef = useRef(t)
  tRef.current = t

  const loadMxFailures = useCallback(async (): Promise<void> => {
    const version = ++mxLoadVersionRef.current
    setLoadingMxFailures(true)
    setMxFailuresError('')
    try {
      const data = await api.admin.mxFailures()
      if (version !== mxLoadVersionRef.current || !data) return
      setMxFailures(data.domains ?? [])
      const count = data.mxFailures24h ?? 0
      setMxFailures24h(count)
      onAttentionRef.current?.(count)
    } catch (cause) {
      if (version !== mxLoadVersionRef.current) return
      setMxFailuresError(
        cause instanceof ApiError ? cause.message : tRef.current('error.unavailable'),
      )
    } finally {
      if (version === mxLoadVersionRef.current) setLoadingMxFailures(false)
    }
  }, [])

  useEffect(() => {
    void loadMxFailures()
    return () => {
      mxLoadVersionRef.current += 1
    }
  }, [loadMxFailures])

  const isBusy = pending || syncing
  busyRef.current = isBusy

  useEffect(() => {
    onBusyRef.current?.(isBusy)
  }, [isBusy])

  useEffect(() => {
    if (!busyRef.current) setDraft(siteToDraft(site))
  }, [site])

  useEffect(() => {
    if (!busyRef.current) setDisplayedDomains([...domains])
  }, [domains])

  useEffect(() => {
    if (!busyRef.current) setDisplayedSync({ ...lastSync })
  }, [lastSync])

  useEffect(() => {
    if (!busyRef.current) setDisplayedSuccessfulSync({ ...lastSuccessfulSync })
  }, [lastSuccessfulSync])

  useEffect(() => {
    if (!busyRef.current) setDisplayedSyncError({ ...lastSyncError })
  }, [lastSyncError])

  function dateTime(value?: string): string {
    return value ? formatDate(value, { dateStyle: 'medium', timeStyle: 'short' }) : t('domains.notYet')
  }

  function syncText(value: SyncStatus, empty: string): string {
    if (!value.created_at) return empty
    return `${value.detail || t('domains.noDetail')}, ${dateTime(value.created_at)}`
  }

  const applySettings = useCallback((settings: AdminSettings, replaceDomains: boolean): void => {
    if (replaceDomains) setDisplayedDomains([...settings.domains])
    setDisplayedSync({ ...settings.lastSync })
    setDisplayedSuccessfulSync({ ...settings.lastSuccessfulSync })
    setDisplayedSyncError({ ...settings.lastSyncError })
  }, [])

  async function changeAutoSync(checked: boolean): Promise<void> {
    const previous = draft.autoSyncDomains
    if (!checked && !window.confirm(t('domains.confirm'))) {
      return
    }
    setDraft((prev) => ({ ...prev, autoSyncDomains: checked }))
    setPending(true)
    busyRef.current = true
    onBusyRef.current?.(true)
    try {
      const settings = await api.admin.updateSettings({ site: { autoSyncDomains: checked } }, csrf)
      setDraft((prev) => ({ ...prev, autoSyncDomains: settings.site.autoSyncDomains }))
      onUpdated?.(settings)
      applySettings(settings, true)
      toastActions.success(
        t('domains.autoStatus', {
          status: t(settings.site.autoSyncDomains ? 'domains.enabled' : 'domains.disabled'),
        }),
      )
    } catch (cause) {
      setDraft((prev) => ({ ...prev, autoSyncDomains: previous }))
      toastActions.error(cause instanceof Error ? cause.message : t('error.syncUpdate'))
    } finally {
      setPending(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (draft.localPartMin > draft.localPartMax) {
      toastActions.error(t('domains.localRange'))
      return
    }
    setPending(true)
    busyRef.current = true
    onBusyRef.current?.(true)
    try {
      const settings = await api.admin.updateSettings(
        {
          site: {
            autoSyncDomains: draft.autoSyncDomains,
            fetchSeconds: draft.fetchSeconds,
            messageLimit: draft.messageLimit,
            localPartMin: draft.localPartMin,
            localPartMax: draft.localPartMax,
            forbiddenIds: parseList(draft.forbiddenIds),
            blockedSenderDomains: parseList(draft.blockedSenderDomains),
            blacklistedDomains: parseList(draft.blacklistedDomains),
          },
        },
        csrf,
      )
      onUpdated?.(settings)
      applySettings(settings, true)
      toastActions.success(t('domains.saved'))
    } catch (cause) {
      toastActions.error(cause instanceof Error ? cause.message : t('error.domains'))
    } finally {
      setPending(false)
    }
  }

  async function addManualDomain(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const domain = manualDomain.trim()
    if (!domain) return
    setPending(true)
    busyRef.current = true
    onBusyRef.current?.(true)
    try {
      const settings = await api.admin.updateSettings(
        {
          site: {
            manualDomains: [...site.manualDomains, domain],
          },
        },
        csrf,
      )
      setManualDomain('')
      onUpdated?.(settings)
      applySettings(settings, true)
      toastActions.success(t('domains.added'))
    } catch (cause) {
      toastActions.error(cause instanceof Error ? cause.message : t('error.domains'))
    } finally {
      setPending(false)
    }
  }

  const removeDomain = useCallback(
    async (domain: string): Promise<void> => {
      const manual = site.manualDomains.includes(domain)
      setPending(true)
      busyRef.current = true
      onBusyRef.current?.(true)
      try {
        const settings = await api.admin.updateSettings(
          {
            site: manual
              ? { manualDomains: site.manualDomains.filter((value) => value !== domain) }
              : { blacklistedDomains: [...new Set([...site.blacklistedDomains, domain])] },
          },
          csrf,
        )
        onUpdated?.(settings)
        applySettings(settings, true)
        toastActions.success(manual ? tRef.current('domains.removed') : tRef.current('domains.hidden'))
      } catch (cause) {
        toastActions.error(cause instanceof Error ? cause.message : tRef.current('error.domains'))
      } finally {
        setPending(false)
      }
    },
    [applySettings, csrf, onUpdated, site.blacklistedDomains, site.manualDomains],
  )

  async function syncNow(): Promise<void> {
    setSyncing(true)
    busyRef.current = true
    onBusyRef.current?.(true)
    try {
      try {
        const result = await api.admin.syncDomains(csrf)
        setDisplayedDomains([...result.domains])
        setDisplayedSync({ ...result.lastSync })
        setDisplayedSuccessfulSync({ ...result.lastSync })
        onSynced?.(result.domains, result.lastSync)
        toastActions.success(t('domains.complete', { count: formatNumber(result.domains.length) }))
      } catch (cause) {
        toastActions.error(cause instanceof Error ? cause.message : t('error.sync'))
        try {
          const settings = await api.admin.settings()
          onUpdated?.(settings)
          applySettings(settings, false)
        } catch {
          // Keep the sync error and last known whitelist when refresh also fails.
        }
        return
      }

      try {
        const settings = await api.admin.settings()
        onUpdated?.(settings)
        applySettings(settings, true)
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : t('error.settingsRefresh')
        toastActions.error(t('error.domainsSynced', { detail }))
      }
    } finally {
      setSyncing(false)
    }
  }

  const domainRows = useMemo<DomainRow[]>(
    () => displayedDomains.map((domain) => ({ id: domain, domain })),
    [displayedDomains],
  )

  const domainColumns = useMemo<GridColDef<DomainRow>[]>(
    () => [
      {
        field: 'domain',
        headerName: t('address.domain'),
        flex: 1,
        minWidth: 180,
        cellClassName: 'tmail-mono-cell domain-name',
      },
      {
        field: 'actions',
        headerName: t('bulkCode.actions'),
        width: 130,
        sortable: false,
        filterable: false,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params) => (
          <Button
            className="secondary-button compact-button"
            type="button"
            variant="outlined"
            size="small"
            disabled={isBusy}
            aria-label={t('domains.remove', { domain: params.row.domain })}
            onClick={() => { void removeDomain(params.row.domain) }}
          >
            {t('domains.removeText')}
          </Button>
        ),
      },
    ],
    [isBusy, removeDomain, t],
  )

  const mxFailureRows = useMemo(
    () =>
      mxFailures.map((row, index) => ({
        ...row,
        id: row.domain || `unknown-${index}`,
        domain: row.domain || '—',
      })),
    [mxFailures],
  )

  const mxFailureColumns = useMemo<GridColDef<MxFailureDomain & { id: string }>[]>(
    () => [
      {
        field: 'domain',
        headerName: t('dashboard.colDomain'),
        flex: 1.2,
        minWidth: 160,
        cellClassName: 'tmail-mono-cell',
      },
      {
        field: 'kind',
        headerName: t('dashboard.colKind'),
        flex: 1,
        minWidth: 185,
        valueGetter: (_value, row) =>
          tRef.current(row.kind === 'mx_mismatch' ? 'dashboard.mxMismatch' : 'dashboard.mxLookupError'),
        renderCell: (params) => {
          const isMismatch = params.row.kind === 'mx_mismatch'
          return (
            <Chip
              size="small"
              icon={<AppIcon name="alert-triangle" sx={{ fontSize: '1rem' }} />}
              label={tRef.current(isMismatch ? 'dashboard.mxMismatch' : 'dashboard.mxLookupError')}
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
        field: 'count',
        headerName: t('domains.mxColCount'),
        width: 120,
        align: 'right',
        headerAlign: 'right',
        cellClassName: 'tmail-mono-cell',
        valueFormatter: (value: number | null | undefined) => (value != null ? formatNumber(value) : '—'),
      },
      {
        field: 'last_seen',
        headerName: t('domains.mxColLastSeen'),
        width: 190,
        cellClassName: 'tmail-mono-cell',
        valueFormatter: (value: string) =>
          value ? formatDate(value, { dateStyle: 'medium', timeStyle: 'short' }) : '—',
      },
      {
        field: 'detail',
        headerName: t('domains.mxColDetail'),
        flex: 1.4,
        minWidth: 180,
        renderCell: (params) => (
          <Typography
            variant="body2"
            title={params.row.detail || undefined}
            sx={{
              fontFamily: params.row.detail ? MONO_FONT_FAMILY : undefined,
              fontSize: '0.82rem',
              color: params.row.detail ? 'text.primary' : 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {params.row.detail || '—'}
          </Typography>
        ),
      },
    ],
    [formatDate, formatNumber, t],
  )

  return (
    <Box component="section" className="admin-section" aria-labelledby="domains-title" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
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
        <Box>
          <Typography variant="overline" className="eyebrow" color="text.secondary" sx={{ display: 'block', letterSpacing: '0.08em' }}>
            {t('domains.eyebrow')}
          </Typography>
          <Typography id="domains-title" component="h1" variant="h4" sx={{ fontSize: '2rem', fontWeight: 500, lineHeight: 1.2 }}>
            {t('admin.domains')}
          </Typography>
        </Box>
        <Button
          className="secondary-button compact-button"
          type="button"
          variant="outlined"
          disabled={isBusy}
          onClick={() => { void syncNow() }}
          startIcon={
            <AppIcon
              name="refresh-cw"
              className={syncing ? 'spinning' : undefined}
              sx={syncing ? { animation: `${spin} 1s linear infinite` } : undefined}
            />
          }
        >
          {syncing ? t('domains.syncing') : t('domains.sync')}
        </Button>
      </Box>

      <Box
        className="admin-data-grid domains-overview"
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.25fr 1fr' }, gap: 2.5, alignItems: 'start' }}
      >
        <Card component="section" aria-labelledby="whitelist-title" className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Stack direction="row" className="card-header-with-badge" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography id="whitelist-title" component="h2" variant="h6" className="card-title">
              {t('domains.whitelist')}
            </Typography>
            <Chip
              size="small"
              label={displayedDomains.length}
              className="count-badge"
              sx={(theme) => ({
                bgcolor: theme.palette.m3.secondaryContainer,
                color: theme.palette.m3.onSecondaryContainer,
                fontFamily: MONO_FONT_FAMILY,
              })}
            />
          </Stack>
          <Box className="domain-list">
            <TMailDataGrid<DomainRow>
              rows={domainRows}
              columns={domainColumns}
              ariaLabel={t('domains.whitelist')}
              emptyText={t('domains.none')}
              minWidth={300}
              hideFooter={domainRows.length <= 10}
            />
          </Box>
        </Card>

        <Card component="section" className="sync-summary settings-card panel" aria-labelledby="last-sync-title" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography id="last-sync-title" component="h2" variant="h6" className="card-title">
            {t('domains.lastSync')}
          </Typography>
          <Box
            component="dl"
            className="sync-details-list"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              m: 0,
              '& .sync-detail-row': {
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
              },
              '& dt': {
                fontSize: '0.8125rem',
                color: 'text.secondary',
                fontWeight: 500,
              },
              '& dd': {
                m: 0,
                fontSize: '0.9rem',
                wordBreak: 'break-word',
              },
            }}
          >
            <div className="sync-detail-row">
              <dt>{t('domains.time')}</dt>
              <dd className="font-mono" style={{ fontFamily: MONO_FONT_FAMILY }}>
                {dateTime(displayedSync.created_at)}
              </dd>
            </div>
            <div className="sync-detail-row">
              <dt>{t('domains.result')}</dt>
              <dd>
                <Chip
                  size="small"
                  label={
                    displayedSync.success === undefined
                      ? t('domains.notYet')
                      : displayedSync.success
                        ? t('domains.success')
                        : t('domains.failed')
                  }
                  className={
                    displayedSync.success === true
                      ? 'status-pill pill-success'
                      : displayedSync.success === false
                        ? 'status-pill pill-error'
                        : 'status-pill pill-neutral'
                  }
                  sx={(theme) => ({
                    bgcolor:
                      displayedSync.success === true
                        ? theme.palette.m3.secondaryContainer
                        : displayedSync.success === false
                          ? theme.palette.m3.errorContainer
                          : theme.palette.m3.surfaceContainerHigh,
                    color:
                      displayedSync.success === true
                        ? theme.palette.m3.onSecondaryContainer
                        : displayedSync.success === false
                          ? theme.palette.m3.onErrorContainer
                          : theme.palette.m3.onSurfaceVariant,
                  })}
                />
              </dd>
            </div>
            <div className="sync-detail-row">
              <dt>{t('domains.detail')}</dt>
              <dd>{displayedSync.detail || t('domains.noDetail')}</dd>
            </div>
            <div className="sync-detail-row">
              <dt>{t('domains.lastSuccess')}</dt>
              <dd className="font-mono" style={{ fontFamily: MONO_FONT_FAMILY }}>
                {syncText(displayedSuccessfulSync, t('domains.notYet'))}
              </dd>
            </div>
            <div className="sync-detail-row">
              <dt>{t('domains.lastError')}</dt>
              <dd
                className={displayedSyncError.created_at ? 'status-error font-mono' : 'font-mono'}
                style={{ fontFamily: MONO_FONT_FAMILY }}
              >
                {syncText(displayedSyncError, t('domains.noDetail'))}
              </dd>
            </div>
          </Box>
        </Card>
      </Box>

      <Card
        component="section"
        aria-labelledby="domains-mx-failures-title"
        className="settings-card panel domains-mx-failures"
        sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <Typography id="domains-mx-failures-title" component="h2" variant="h6" className="card-title">
              {t('domains.mxFailuresTitle')}
            </Typography>
            <Chip
              size="small"
              label={formatNumber(mxFailures24h)}
              className={mxFailures24h ? 'count-badge mx-failures-count-error' : 'count-badge'}
              sx={(theme) => ({
                bgcolor: mxFailures24h ? theme.palette.m3.errorContainer : theme.palette.m3.secondaryContainer,
                color: mxFailures24h ? theme.palette.m3.onErrorContainer : theme.palette.m3.onSecondaryContainer,
                fontFamily: MONO_FONT_FAMILY,
              })}
            />
          </Stack>
          <Button
            type="button"
            variant="text"
            size="small"
            disabled={loadingMxFailures}
            onClick={() => { void loadMxFailures() }}
            startIcon={
              <AppIcon
                name="refresh-cw"
                sx={loadingMxFailures ? { animation: `${spin} 0.8s linear infinite` } : undefined}
              />
            }
          >
            {loadingMxFailures ? t('inbox.refreshing') : t('inbox.refresh')}
          </Button>
        </Stack>
        {mxFailuresError ? (
          <Alert severity="error" role="alert">
            {mxFailuresError}
          </Alert>
        ) : (
          <TMailDataGrid<MxFailureDomain & { id: string }>
            rows={mxFailureRows}
            columns={mxFailureColumns}
            ariaLabel={t('domains.mxFailuresTitle')}
            emptyText={t('domains.mxFailuresEmpty')}
            minWidth={760}
            hideFooter={mxFailureRows.length <= 10}
          />
        )}
      </Card>

      <Box component="form" className="settings-form" onSubmit={addManualDomain}>
        <Box component="fieldset" className="settings-fields" disabled={isBusy} sx={{ border: 0, p: 0, m: 0 }}>
          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('domains.addWhitelist')}
            </Typography>
            <Stack spacing={1} className="field">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} className="form-actions inline-add-row" sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
                <TextField
                  id="manual-domain"
                  name="manualDomain"
                  label={t('address.domain')}
                  value={manualDomain}
                  onChange={(e) => setManualDomain(e.target.value)}
                  required
                  disabled={isBusy}
                  fullWidth
                  slotProps={{
                    htmlInput: {
                      inputMode: 'url',
                      autoComplete: 'off',
                      autoCapitalize: 'none',
                      className: 'font-mono',
                      style: { fontFamily: MONO_FONT_FAMILY },
                    },
                  }}
                />
                <Button
                  className="secondary-button compact-button"
                  type="submit"
                  variant="outlined"
                  disabled={isBusy}
                  startIcon={<AppIcon name="plus" />}
                  sx={{ flexShrink: 0 }}
                >
                  {t('domains.add')}
                </Button>
              </Stack>
              <Typography component="small" variant="caption" color="text.secondary">
                {t('domains.addHelp')}
              </Typography>
            </Stack>
          </Card>
        </Box>
      </Box>

      <Box component="form" className="settings-form" onSubmit={save}>
        <Box component="fieldset" className="settings-fields" disabled={isBusy} sx={{ border: 0, p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('domains.syncPolicy')}
            </Typography>
            <FormControlLabel
              className="check-field margin-bottom-md"
              control={
                <Checkbox
                  name="autoSyncDomains"
                  checked={draft.autoSyncDomains}
                  disabled={isBusy}
                  onChange={(e) => { void changeAutoSync(e.target.checked) }}
                />
              }
              label={t('domains.auto')}
            />
            <Box
              className="settings-grid"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}
            >
              <TextField
                id="fetch-seconds"
                name="fetchSeconds"
                type="number"
                label={t('domains.poll')}
                value={draft.fetchSeconds}
                onChange={(e) => setDraft((prev) => ({ ...prev, fetchSeconds: Number(e.target.value) }))}
                required
                disabled={isBusy}
                fullWidth
                slotProps={{ htmlInput: { min: 5, max: 300 } }}
              />
              <TextField
                id="message-limit"
                name="messageLimit"
                type="number"
                label={t('domains.limit')}
                value={draft.messageLimit}
                onChange={(e) => setDraft((prev) => ({ ...prev, messageLimit: Number(e.target.value) }))}
                required
                disabled={isBusy}
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: 100 } }}
              />
              <TextField
                id="local-min"
                name="localPartMin"
                type="number"
                label={t('domains.min')}
                value={draft.localPartMin}
                onChange={(e) => setDraft((prev) => ({ ...prev, localPartMin: Number(e.target.value) }))}
                required
                disabled={isBusy}
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: 64 } }}
              />
              <TextField
                id="local-max"
                name="localPartMax"
                type="number"
                label={t('domains.max')}
                value={draft.localPartMax}
                onChange={(e) => setDraft((prev) => ({ ...prev, localPartMax: Number(e.target.value) }))}
                required
                disabled={isBusy}
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: 64 } }}
              />
            </Box>

            <Box
              className="settings-grid settings-grid-three margin-top-md"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}
            >
              <TextField
                id="forbidden-ids"
                name="forbiddenIds"
                label={t('domains.forbidden')}
                value={draft.forbiddenIds}
                onChange={(e) => setDraft((prev) => ({ ...prev, forbiddenIds: e.target.value }))}
                helperText={t('domains.listHelp')}
                multiline
                minRows={7}
                disabled={isBusy}
                fullWidth
                slotProps={{ htmlInput: { className: 'font-mono', style: { fontFamily: MONO_FONT_FAMILY, fontSize: '0.85rem' } } }}
              />
              <TextField
                id="blocked-senders"
                name="blockedSenderDomains"
                label={t('domains.blocked')}
                value={draft.blockedSenderDomains}
                onChange={(e) => setDraft((prev) => ({ ...prev, blockedSenderDomains: e.target.value }))}
                helperText={t('domains.listHelp')}
                multiline
                minRows={7}
                disabled={isBusy}
                fullWidth
                slotProps={{ htmlInput: { className: 'font-mono', style: { fontFamily: MONO_FONT_FAMILY, fontSize: '0.85rem' } } }}
              />
              <TextField
                id="blacklisted-domains"
                name="blacklistedDomains"
                label={t('domains.blacklisted')}
                value={draft.blacklistedDomains}
                onChange={(e) => setDraft((prev) => ({ ...prev, blacklistedDomains: e.target.value }))}
                helperText={t('domains.blacklistHelp')}
                multiline
                minRows={7}
                disabled={isBusy}
                fullWidth
                slotProps={{ htmlInput: { className: 'font-mono', style: { fontFamily: MONO_FONT_FAMILY, fontSize: '0.85rem' } } }}
              />
            </Box>
          </Card>

          <Stack direction="row" className="form-actions" sx={{ justifyContent: 'flex-end' }}>
            <Button className="primary-button" type="submit" variant="contained" disabled={isBusy}>
              {pending ? t('reader.saving') : t('domains.save')}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}

export default DomainsTab
