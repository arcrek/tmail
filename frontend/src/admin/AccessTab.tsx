import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { GridColDef } from '@mui/x-data-grid'
import { api } from '../api'
import { copyText } from '../clipboard'
import { AppIcon } from '../components/AppIcon'
import { TMailDataGrid } from '../components/TMailDataGrid'
import { useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { toastActions } from '../toast'
import type { AccessCredential } from '../types'

export interface AccessTabProps {
  csrf: string
  onBusyChange?: (busy: boolean) => void
}

export function AccessTab({ csrf, onBusyChange }: AccessTabProps) {
  const [credentials, setCredentials] = useState<AccessCredential[]>([])
  const [passwordLabel, setPasswordLabel] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [tokenLabel, setTokenLabel] = useState('')
  const [secret, setSecret] = useState('')
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState(false)

  const onBusyRef = useRef(onBusyChange)
  onBusyRef.current = onBusyChange
  const loadVersionRef = useRef(0)
  const mountedRef = useRef(true)
  const pendingRef = useRef(false)

  const { t, formatDate } = useI18n()
  const tRef = useRef(t)
  tRef.current = t

  const loadCredentials = useCallback(async (clearSecret = false): Promise<void> => {
    const version = ++loadVersionRef.current
    if (clearSecret) setSecret('')
    try {
      const result = await api.admin.accessCredentials.list()
      if (!mountedRef.current || version !== loadVersionRef.current) return
      setCredentials(result.credentials)
    } catch (cause) {
      if (!mountedRef.current || version !== loadVersionRef.current) return
      toastActions.error(cause instanceof Error ? cause.message : tRef.current('error.accessLoad'))
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadCredentials()
    return () => {
      mountedRef.current = false
      loadVersionRef.current += 1
    }
  }, [loadCredentials])

  async function create(
    body: { kind: 'password'; label: string; password: string } | { kind: 'token'; label: string },
  ): Promise<boolean> {
    if (pendingRef.current) return false
    pendingRef.current = true
    setPending(true)
    onBusyRef.current?.(true)
    try {
      const created = await api.admin.accessCredentials.create(body, csrf)
      if (!mountedRef.current) return false
      setSecret(created.secret ?? '')
      setCopied(false)
      await loadCredentials()
      return true
    } catch (cause) {
      if (mountedRef.current) {
        toastActions.error(cause instanceof Error ? cause.message : tRef.current('error.access'))
      }
      return false
    } finally {
      pendingRef.current = false
      if (mountedRef.current) setPending(false)
      onBusyRef.current?.(false)
    }
  }

  async function addPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (password !== passwordConfirm) {
      toastActions.error(t('error.accessPasswordMatch'))
      return
    }
    const ok = await create({ kind: 'password', label: passwordLabel.trim(), password })
    if (!ok) return
    setPassword('')
    setPasswordConfirm('')
    setPasswordLabel('')
  }

  async function generateToken(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const ok = await create({ kind: 'token', label: tokenLabel.trim() })
    if (!ok) return
    setTokenLabel('')
  }

  const revoke = useCallback(
    async (id: string, label: string): Promise<void> => {
      if (pendingRef.current) return
      if (!window.confirm(tRef.current('access.revokeConfirm', { label }))) return
      pendingRef.current = true
      setPending(true)
      onBusyRef.current?.(true)
      try {
        await api.admin.accessCredentials.remove(id, csrf)
        if (!mountedRef.current) return
        await loadCredentials(true)
      } catch (cause) {
        if (mountedRef.current) {
          toastActions.error(cause instanceof Error ? cause.message : tRef.current('error.access'))
        }
      } finally {
        pendingRef.current = false
        if (mountedRef.current) setPending(false)
        onBusyRef.current?.(false)
      }
    },
    [csrf, loadCredentials],
  )

  async function copySecret(): Promise<void> {
    try {
      await copyText(secret)
      setCopied(true)
    } catch {
      toastActions.error(t('error.accessCopy'))
    }
  }

  const columns = useMemo<GridColDef<AccessCredential>[]>(
    () => [
      {
        field: 'kind',
        headerName: t('access.kind'),
        width: 104,
        renderCell: (params) => (
          <Chip
            size="small"
            label={t(`access.${params.row.kind}`)}
            className={params.row.kind === 'token' ? 'credential-badge pill-success' : 'credential-badge pill-neutral'}
            sx={(theme) => ({
              bgcolor:
                params.row.kind === 'token'
                  ? theme.palette.m3.secondaryContainer
                  : theme.palette.m3.surfaceContainerHigh,
              color:
                params.row.kind === 'token'
                  ? theme.palette.m3.onSecondaryContainer
                  : theme.palette.m3.onSurfaceVariant,
            })}
          />
        ),
      },
      {
        field: 'label',
        headerName: t('access.label'),
        flex: 1.2,
        minWidth: 140,
      },
      {
        field: 'createdAt',
        headerName: t('access.created'),
        width: 205,
        cellClassName: 'tmail-mono-cell',
        renderCell: (params) => (
          <Box component="time" dateTime={params.row.createdAt} className="credential-date font-mono" sx={{ fontFamily: MONO_FONT_FAMILY }}>
            {formatDate(params.row.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
          </Box>
        ),
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
            className="secondary-button compact-button danger-text"
            type="button"
            variant="outlined"
            color="error"
            size="small"
            disabled={pending}
            onClick={() => { void revoke(params.row.id, params.row.label) }}
            startIcon={<AppIcon name="trash-2" />}
          >
            {t('access.revoke')}
          </Button>
        ),
      },
    ],
    [formatDate, pending, revoke, t],
  )

  return (
    <Box component="section" className="admin-section" aria-labelledby="access-title" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography variant="overline" className="eyebrow" color="text.secondary" sx={{ display: 'block', letterSpacing: '0.08em' }}>
          {t('access.eyebrow')}
        </Typography>
        <Typography id="access-title" component="h1" variant="h4" sx={{ fontSize: '2rem', fontWeight: 500, lineHeight: 1.2 }}>
          {t('admin.access')}
        </Typography>
      </Box>

      {secret && (
        <Card
          component="section"
          className="panel secret-banner"
          aria-live="polite"
          sx={(theme) => ({
            p: 3,
            bgcolor: theme.palette.m3.primaryContainer,
            color: theme.palette.m3.onPrimaryContainer,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          })}
        >
          <Stack direction="row" spacing={1.5} className="secret-banner-header" sx={{ alignItems: 'flex-start' }}>
            <AppIcon name="key" className="secret-icon" sx={{ mt: 0.25 }} />
            <Box>
              <Typography component="h2" variant="h6" sx={{ fontWeight: 500 }}>
                {t('access.secret')}
              </Typography>
              <Typography variant="body2">{t('access.secretHelp')}</Typography>
            </Box>
          </Stack>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            className="secret-code-wrapper"
            sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}
          >
            <Box
              component="code"
              className="secret-code font-mono"
              sx={(theme) => ({
                fontFamily: MONO_FONT_FAMILY,
                px: 2,
                py: 1,
                borderRadius: '12px',
                bgcolor: theme.palette.m3.surfaceContainerLowest,
                color: theme.palette.m3.onSurface,
                wordBreak: 'break-all',
                flex: 1,
              })}
            >
              {secret}
            </Box>
            <Stack direction="row" spacing={1} className="form-actions">
              <Button
                className="primary-button compact-button"
                type="button"
                variant="contained"
                size="small"
                onClick={() => { void copySecret() }}
                startIcon={<AppIcon name={copied ? 'check' : 'copy'} />}
              >
                {copied ? t('access.copied') : t('access.copy')}
              </Button>
              <Button className="text-button" type="button" variant="text" onClick={() => setSecret('')}>
                {t('access.dismiss')}
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}

      <Box
        className="admin-data-grid access-overview"
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.35fr 1fr' }, gap: 2.5, alignItems: 'start' }}
      >
        <Card component="section" className="settings-card panel" aria-labelledby="access-list-title" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Stack direction="row" className="card-header-with-badge" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography id="access-list-title" component="h2" variant="h6" className="card-title">
              {t('access.list')}
            </Typography>
            <Chip
              size="small"
              label={credentials.length}
              className="count-badge"
              sx={(theme) => ({
                bgcolor: theme.palette.m3.secondaryContainer,
                color: theme.palette.m3.onSecondaryContainer,
                fontFamily: MONO_FONT_FAMILY,
              })}
            />
          </Stack>
          <TMailDataGrid<AccessCredential>
            rows={credentials}
            columns={columns}
            ariaLabel={t('access.list')}
            emptyText={t('access.none')}
            minWidth={600}
            hideFooter={credentials.length <= 10}
          />
        </Card>

        <Stack spacing={2.5} className="access-forms-column">
          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('access.addPassword')}
            </Typography>
            <Box component="form" className="settings-form" onSubmit={addPassword}>
              <Box
                component="fieldset"
                className="settings-fields"
                disabled={pending}
                sx={{ border: 0, p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <TextField
                  id="access-password-label"
                  label={t('access.label')}
                  value={passwordLabel}
                  onChange={(e) => setPasswordLabel(e.target.value)}
                  required
                  disabled={pending}
                  fullWidth
                />
                <TextField
                  id="access-password"
                  type="password"
                  label={t('access.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={pending}
                  fullWidth
                />
                <TextField
                  id="access-password-confirm"
                  type="password"
                  label={t('access.passwordConfirm')}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={pending}
                  fullWidth
                />
                <Box>
                  <Button className="primary-button" type="submit" variant="contained" disabled={pending}>
                    {t('access.addPassword')}
                  </Button>
                </Box>
              </Box>
            </Box>
          </Card>

          <Card className="settings-card panel margin-top-md" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('access.generateToken')}
            </Typography>
            <Box component="form" className="settings-form" onSubmit={generateToken}>
              <Box
                component="fieldset"
                className="settings-fields"
                disabled={pending}
                sx={{ border: 0, p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <TextField
                  id="access-token-label"
                  label={t('access.label')}
                  value={tokenLabel}
                  onChange={(e) => setTokenLabel(e.target.value)}
                  required
                  disabled={pending}
                  fullWidth
                />
                <Box>
                  <Button className="secondary-button" type="submit" variant="outlined" disabled={pending}>
                    {t('access.generateToken')}
                  </Button>
                </Box>
              </Box>
            </Box>
          </Card>
        </Stack>
      </Box>
    </Box>
  )
}

export default AccessTab
