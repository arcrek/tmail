import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { translate, useI18n } from '../i18n'
import { authorizationFailed, openMailbox } from '../mailbox-access'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { randomDomain, randomLocalPart } from '../randomAddress'
import { loadSessions, removeSession } from '../session'
import { useToast } from '../toast'
import type { AddressSession, DomainResource } from '../types'
import { AppIcon } from './AppIcon'

export interface AddressPanelProps {
  accessToken?: string
  onOpen: (session: AddressSession) => void
  onLogin: (address: string) => void
}

export function AddressPanel({ accessToken = '', onOpen, onLogin }: AddressPanelProps) {
  const { t } = useI18n()
  const toast = useToast()

  const [domains, setDomains] = useState<DomainResource[]>([])
  const [selectedDomain, setSelectedDomain] = useState('')
  const [localPart, setLocalPart] = useState('')
  const [quickEmail, setQuickEmail] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [loadingDomains, setLoadingDomains] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [domainError, setDomainError] = useState('')
  const [copied, setCopied] = useState(false)
  const [sessions, setSessions] = useState<AddressSession[]>(() => loadSessions())

  const modeGroupRef = useRef<HTMLDivElement>(null)
  const domainsVersionRef = useRef(0)
  const submitVersionRef = useRef(0)
  const submittingRef = useRef(false)
  const onOpenRef = useRef(onOpen)
  const onLoginRef = useRef(onLogin)
  onOpenRef.current = onOpen
  onLoginRef.current = onLogin

  const address =
    localPart && selectedDomain ? `${localPart.trim().toLowerCase()}@${selectedDomain}` : ''

  useEffect(() => {
    setCopied(false)
  }, [address])

  useEffect(() => {
    const handleStorage = () => setSessions(loadSessions())
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      domainsVersionRef.current += 1
      submitVersionRef.current += 1
    }
  }, [])

  const loadDomains = useCallback(async () => {
    const version = ++domainsVersionRef.current
    setLoadingDomains(true)
    setDomainError('')
    try {
      const response = await api.domains(1, accessToken || undefined)
      if (version !== domainsVersionRef.current) return
      const active = response['hydra:member'].filter((domain) => domain.isActive !== false)
      setDomains(active)
      setSelectedDomain(active[0]?.domain ?? '')
    } catch (cause) {
      if (version !== domainsVersionRef.current) return
      setDomainError(cause instanceof ApiError ? cause.message : translate('error.unavailable'))
    } finally {
      if (version === domainsVersionRef.current) setLoadingDomains(false)
    }
  }, [accessToken])

  useEffect(() => {
    void loadDomains()
  }, [loadDomains])

  /** Radio-group keyboard pattern: arrow keys move selection and focus between the two modes. */
  function onModeKeydown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const nextMode = mode === 'new' ? 'existing' : 'new'
    setMode(nextMode)
    modeGroupRef.current?.querySelector<HTMLElement>(`[data-mode="${nextMode}"]`)?.focus()
  }

  async function submit(submittedAddress = address): Promise<void> {
    if (!submittedAddress || submittingRef.current) return
    const version = ++submitVersionRef.current
    submittingRef.current = true
    setSubmitting(true)
    try {
      const session = await openMailbox(submittedAddress, accessToken || undefined)
      if (version === submitVersionRef.current) onOpenRef.current(session)
    } catch (cause) {
      if (version !== submitVersionRef.current) return
      if (authorizationFailed(cause)) onLoginRef.current(submittedAddress)
      else toast.error(cause instanceof ApiError ? cause.message : translate('error.unavailable'))
    } finally {
      submittingRef.current = false
      if (version === submitVersionRef.current) setSubmitting(false)
    }
  }

  async function randomize(): Promise<void> {
    if (!domains.length || submittingRef.current) return
    const nextLocal = randomLocalPart()
    const nextDomain = randomDomain(domains.map((domain) => domain.domain))
    setLocalPart(nextLocal)
    setSelectedDomain(nextDomain)
    setCopied(false)
    await submit(`${nextLocal.trim().toLowerCase()}@${nextDomain}`)
  }

  async function copyAddress(): Promise<void> {
    if (!address) return
    try {
      await copyText(address)
      setCopied(true)
      toast.success(t('address.copiedNotice'))
    } catch {
      toast.error(t('error.copy'))
    }
  }

  function forget(addr: string): void {
    setSessions(removeSession(addr))
  }

  function handleNewSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void submit()
  }

  function handleQuickSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void submit(quickEmail.trim().toLowerCase())
  }

  return (
    <>
      <Box
        component="section"
        className="home-hero"
        aria-labelledby="address-title"
        sx={(theme) => ({
          bgcolor: theme.palette.m3.surfaceContainerLow,
          borderRadius: { xs: '28px', md: '40px' },
          p: { xs: 2.25, sm: 4, md: 6 },
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 2.5, md: 3 },
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
        })}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Typography
            component="h1"
            id="address-title"
            sx={(theme) => ({
              fontSize: { xs: '2rem', sm: '2.75rem', md: '3.75rem' },
              lineHeight: { xs: 1.12, md: 1.07 },
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: theme.palette.m3.onSurface,
              m: 0,
            })}
          >
            {t('address.title')}
          </Typography>
          <Typography
            component="p"
            className="lede"
            sx={(theme) => ({
              fontSize: { xs: '1rem', md: '1.125rem' },
              lineHeight: 1.5,
              color: theme.palette.m3.onSurfaceVariant,
              m: 0,
              maxWidth: '52ch',
            })}
          >
            {t('address.lede')}
          </Typography>
        </Box>

        <Box
          ref={modeGroupRef}
          className="mode-switch"
          role="radiogroup"
          aria-label={t('address.mode')}
          sx={(theme) => ({
            display: 'inline-flex',
            alignSelf: 'flex-start',
            maxWidth: '100%',
            borderRadius: 9999,
            border: `1px solid ${theme.palette.m3.outline}`,
            bgcolor: theme.palette.m3.surfaceContainerLowest,
            overflow: 'hidden',
          })}
        >
          <Box
            component="button"
            type="button"
            role="radio"
            data-mode="new"
            aria-checked={mode === 'new'}
            tabIndex={mode === 'new' ? 0 : -1}
            onClick={() => setMode('new')}
            onKeyDown={onModeKeydown}
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              minHeight: 40,
              px: { xs: 1.75, sm: 2.25 },
              py: 0.75,
              border: 0,
              borderRight: `1px solid ${theme.palette.m3.outline}`,
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              bgcolor: mode === 'new' ? theme.palette.m3.secondaryContainer : 'transparent',
              color: mode === 'new' ? theme.palette.m3.onSecondaryContainer : theme.palette.m3.onSurface,
              transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1)',
              '&:hover': {
                bgcolor:
                  mode === 'new'
                    ? theme.palette.m3.secondaryContainer
                    : theme.palette.m3.surfaceContainerHigh,
              },
            })}
          >
            {mode === 'new' && <AppIcon name="check" />}
            {t('address.modeNew')}
          </Box>
          <Box
            component="button"
            type="button"
            role="radio"
            data-mode="existing"
            aria-checked={mode === 'existing'}
            tabIndex={mode === 'existing' ? 0 : -1}
            onClick={() => setMode('existing')}
            onKeyDown={onModeKeydown}
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              minHeight: 40,
              px: { xs: 1.75, sm: 2.25 },
              py: 0.75,
              border: 0,
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              bgcolor: mode === 'existing' ? theme.palette.m3.secondaryContainer : 'transparent',
              color: mode === 'existing' ? theme.palette.m3.onSecondaryContainer : theme.palette.m3.onSurface,
              transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1)',
              '&:hover': {
                bgcolor:
                  mode === 'existing'
                    ? theme.palette.m3.secondaryContainer
                    : theme.palette.m3.surfaceContainerHigh,
              },
            })}
          >
            {mode === 'existing' && <AppIcon name="check" />}
            {t('address.modeExisting')}
          </Box>
        </Box>

        <Box
          className="composer-pane"
          hidden={mode !== 'new'}
          sx={{ display: mode === 'new' ? 'block' : 'none', width: '100%' }}
        >
          {loadingDomains ? (
            <Box
              className="composer loading-panel"
              aria-live="polite"
              sx={{ width: '100%' }}
            >
              <Skeleton
                variant="rounded"
                className="skeleton skeleton-field"
                height={56}
                sx={{ width: '100%', borderRadius: 9999 }}
              />
              <span className="sr-only">{t('address.loading')}</span>
            </Box>
          ) : domainError ? (
            <Paper
              className="empty-state"
              role="alert"
              sx={(theme) => ({
                p: 3,
                borderRadius: '24px',
                bgcolor: theme.palette.m3.errorContainer,
                color: theme.palette.m3.onErrorContainer,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 1.25,
              })}
            >
              <Typography component="h2" variant="h6" sx={{ m: 0 }}>
                {t('address.failed')}
              </Typography>
              <Typography component="p" variant="body2" sx={{ m: 0 }}>
                {domainError}
              </Typography>
              <Button
                className="secondary-button"
                type="button"
                variant="outlined"
                onClick={() => void loadDomains()}
                sx={(theme) => ({
                  borderColor: theme.palette.m3.onErrorContainer,
                  color: theme.palette.m3.onErrorContainer,
                })}
              >
                {t('address.retry')}
              </Button>
            </Paper>
          ) : domains.length === 0 ? (
            <Paper
              className="empty-state"
              sx={(theme) => ({
                p: 3,
                borderRadius: '24px',
                bgcolor: theme.palette.m3.surfaceContainerLowest,
                border: `1px solid ${theme.palette.m3.outlineVariant}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 1.25,
              })}
            >
              <Typography component="h2" variant="h6" sx={{ m: 0 }}>
                {t('address.none')}
              </Typography>
              <Typography component="p" variant="body2" color="text.secondary" sx={{ m: 0 }}>
                {t('address.noneHelp')}
              </Typography>
              <Button className="primary-button" variant="contained" type="submit" disabled>
                {t('address.open')}
              </Button>
            </Paper>
          ) : (
            <Box className="address-form" sx={{ width: '100%' }}>
              <h2 className="sr-only">{t('address.create')}</h2>
              <Box
                component="form"
                className="composer"
                onSubmit={handleNewSubmit}
                sx={(theme) => ({
                  display: 'flex',
                  flexWrap: { xs: 'wrap', sm: 'nowrap' },
                  alignItems: 'center',
                  gap: 1,
                  width: '100%',
                  minHeight: 56,
                  p: { xs: 1, sm: 0.75 },
                  pl: { xs: 1.5, sm: 2.5 },
                  borderRadius: { xs: '24px', sm: 9999 },
                  bgcolor: theme.palette.m3.surfaceContainerLowest,
                  border: `1px solid ${theme.palette.m3.outlineVariant}`,
                  boxShadow:
                    theme.palette.mode === 'dark'
                      ? '0 4px 18px rgba(0, 0, 0, 0.36)'
                      : '0 4px 20px rgba(52, 92, 168, 0.08)',
                  transition: 'border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
                  '&:focus-within': {
                    borderColor: theme.palette.primary.main,
                  },
                })}
              >
                <Box
                  className="composer-field"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: '1 1 180px',
                    minWidth: 0,
                    gap: 0.75,
                    flexWrap: { xs: 'wrap', sm: 'nowrap' },
                  }}
                >
                  <label className="sr-only" htmlFor="local-part">
                    {t('address.name')}
                  </label>
                  <Box
                    component="input"
                    id="local-part"
                    value={localPart}
                    onChange={(event) => setLocalPart(event.target.value)}
                    name="local-part"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={t('address.namePlaceholder')}
                    minLength={1}
                    maxLength={64}
                    pattern="[A-Za-z0-9](?:[A-Za-z0-9._+\-]*[A-Za-z0-9])?"
                    required
                    sx={(theme) => ({
                      flex: '1 1 90px',
                      minWidth: 0,
                      width: '100%',
                      minHeight: 40,
                      border: 0,
                      bgcolor: 'transparent',
                      color: theme.palette.m3.onSurface,
                      fontFamily: MONO_FONT_FAMILY,
                      fontSize: { xs: '0.9375rem', sm: '1rem' },
                      fontWeight: 500,
                      '&::placeholder': {
                        color: theme.palette.m3.onSurfaceVariant,
                        opacity: 0.8,
                      },
                    })}
                  />
                  <Box
                    component="span"
                    className="at-sign"
                    aria-hidden="true"
                    sx={(theme) => ({
                      fontFamily: MONO_FONT_FAMILY,
                      fontSize: '1rem',
                      fontWeight: 500,
                      color: theme.palette.m3.onSurfaceVariant,
                      userSelect: 'none',
                      flexShrink: 0,
                    })}
                  >
                    @
                  </Box>
                  <Box
                    component="span"
                    className="domain-chip"
                    sx={(theme) => ({
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      maxWidth: '100%',
                      minHeight: 36,
                      borderRadius: 9999,
                      bgcolor: theme.palette.m3.surfaceContainerHigh,
                      color: theme.palette.m3.onSurface,
                      flexShrink: 0,
                    })}
                  >
                    <label className="sr-only" htmlFor="domain">
                      {t('address.domain')}
                    </label>
                    <Box
                      component="select"
                      id="domain"
                      value={selectedDomain}
                      onChange={(event) => setSelectedDomain(event.target.value)}
                      name="domain"
                      required
                      sx={(theme) => ({
                        appearance: 'none',
                        border: 0,
                        bgcolor: 'transparent',
                        color: 'inherit',
                        fontFamily: MONO_FONT_FAMILY,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        minHeight: 36,
                        pl: 1.5,
                        pr: 4,
                        maxWidth: '100%',
                        borderRadius: 9999,
                        cursor: 'pointer',
                        '& option': {
                          bgcolor: theme.palette.m3.surfaceContainerLow,
                          color: theme.palette.m3.onSurface,
                        },
                      })}
                    >
                      {domains.map((domain) => (
                        <option key={domain.id} value={domain.domain}>
                          {domain.domain}
                        </option>
                      ))}
                    </Box>
                    <AppIcon
                      name="chevron-down"
                      sx={{
                        position: 'absolute',
                        right: 10,
                        pointerEvents: 'none',
                      }}
                    />
                  </Box>
                </Box>

                <Box
                  className="composer-actions"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    flexShrink: 0,
                    width: { xs: '100%', sm: 'auto' },
                    justifyContent: { xs: 'flex-end', sm: 'flex-start' },
                  }}
                >
                  <Tooltip title={t('address.random')}>
                    <span>
                      <IconButton
                        className="icon-button random-button"
                        type="button"
                        aria-label={t('address.random')}
                        title={t('address.random')}
                        disabled={loadingDomains || !domains.length || submitting}
                        onClick={() => void randomize()}
                        sx={(theme) => ({
                          bgcolor: theme.palette.m3.surfaceContainerHigh,
                          color: theme.palette.m3.onSurfaceVariant,
                          '&:hover': {
                            bgcolor: theme.palette.m3.secondaryContainer,
                            color: theme.palette.m3.onSecondaryContainer,
                          },
                        })}
                      >
                        <AppIcon name="shuffle" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Button
                    className="primary-button composer-submit"
                    variant="contained"
                    color="primary"
                    type="submit"
                    disabled={submitting || !address}
                    endIcon={<AppIcon name="arrow-right" />}
                    sx={{
                      minHeight: { xs: 44, sm: 48 },
                      px: { xs: 2, sm: 2.75 },
                      flex: { xs: '1 1 auto', sm: '0 0 auto' },
                    }}
                  >
                    {submitting ? t('address.opening') : t('address.open')}
                  </Button>
                </Box>
              </Box>

              {address && (
                <Box
                  className="address-preview"
                  sx={(theme) => ({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1,
                    mt: 1.5,
                    px: 2,
                    py: 1,
                    borderRadius: '16px',
                    bgcolor: theme.palette.m3.surfaceContainerHigh,
                  })}
                >
                  <Box
                    component="span"
                    className="address-preview-value"
                    sx={(theme) => ({
                      fontFamily: MONO_FONT_FAMILY,
                      fontSize: '0.9375rem',
                      fontWeight: 500,
                      color: theme.palette.m3.onSurface,
                      wordBreak: 'break-all',
                    })}
                  >
                    {address}
                  </Box>
                  <Button
                    className="text-button"
                    type="button"
                    variant="text"
                    size="small"
                    startIcon={<AppIcon name={copied ? 'check' : 'copy'} />}
                    onClick={() => void copyAddress()}
                    sx={{ minHeight: 36, px: 1.5 }}
                  >
                    {copied ? t('address.copied') : t('address.copy')}
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>

        <Box
          component="section"
          className="quick-access"
          aria-labelledby="quick-access-title"
          hidden={mode !== 'existing'}
          sx={{ display: mode === 'existing' ? 'block' : 'none', width: '100%' }}
        >
          <h2 id="quick-access-title" className="sr-only">
            {t('address.quickAccess')}
          </h2>
          <Box
            component="form"
            className="composer"
            onSubmit={handleQuickSubmit}
            sx={(theme) => ({
              display: 'flex',
              flexWrap: { xs: 'wrap', sm: 'nowrap' },
              alignItems: 'center',
              gap: 1,
              width: '100%',
              minHeight: 56,
              p: { xs: 1, sm: 0.75 },
              pl: { xs: 1.5, sm: 2.5 },
              borderRadius: { xs: '24px', sm: 9999 },
              bgcolor: theme.palette.m3.surfaceContainerLowest,
              border: `1px solid ${theme.palette.m3.outlineVariant}`,
              boxShadow:
                theme.palette.mode === 'dark'
                  ? '0 4px 18px rgba(0, 0, 0, 0.36)'
                  : '0 4px 20px rgba(52, 92, 168, 0.08)',
              transition: 'border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
              '&:focus-within': {
                borderColor: theme.palette.primary.main,
              },
            })}
          >
            <Box
              className="composer-field"
              sx={{
                display: 'flex',
                alignItems: 'center',
                flex: '1 1 180px',
                minWidth: 0,
              }}
            >
              <label className="sr-only" htmlFor="quick-email">
                {t('address.email')}
              </label>
              <Box
                component="input"
                id="quick-email"
                value={quickEmail}
                onChange={(event) => setQuickEmail(event.target.value)}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t('address.emailPlaceholder')}
                required
                sx={(theme) => ({
                  flex: '1 1 auto',
                  minWidth: 0,
                  width: '100%',
                  minHeight: 40,
                  border: 0,
                  bgcolor: 'transparent',
                  color: theme.palette.m3.onSurface,
                  fontFamily: MONO_FONT_FAMILY,
                  fontSize: { xs: '0.9375rem', sm: '1rem' },
                  fontWeight: 500,
                  '&::placeholder': {
                    color: theme.palette.m3.onSurfaceVariant,
                    opacity: 0.8,
                  },
                })}
              />
            </Box>
            <Box
              className="composer-actions"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                flexShrink: 0,
                width: { xs: '100%', sm: 'auto' },
              }}
            >
              <Button
                className="primary-button composer-submit"
                variant="contained"
                color="primary"
                type="submit"
                disabled={submitting || !quickEmail.trim()}
                endIcon={<AppIcon name="arrow-right" />}
                sx={{
                  minHeight: { xs: 44, sm: 48 },
                  px: { xs: 2, sm: 2.75 },
                  width: { xs: '100%', sm: 'auto' },
                }}
              >
                {submitting ? t('address.opening') : t('address.openMailbox')}
              </Button>
            </Box>
          </Box>
        </Box>

        <Box
          component="section"
          className="saved-inboxes"
          aria-labelledby="remembered-title"
          sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}
        >
          <Typography
            component="h2"
            id="remembered-title"
            sx={(theme) => ({
              fontSize: '0.875rem',
              fontWeight: 500,
              color: theme.palette.m3.onSurfaceVariant,
              m: 0,
            })}
          >
            {t('address.saved')}
          </Typography>

          {sessions.length > 0 ? (
            <Box
              component="ul"
              sx={{
                listStyle: 'none',
                m: 0,
                p: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              {sessions.map((session) => (
                <Box
                  component="li"
                  key={session.address}
                  className="saved-chip"
                  sx={(theme) => ({
                    display: 'inline-flex',
                    alignItems: 'center',
                    maxWidth: '100%',
                    minHeight: 34,
                    borderRadius: '8px',
                    border: `1px solid ${theme.palette.m3.outlineVariant}`,
                    bgcolor: theme.palette.m3.surfaceContainerLowest,
                    overflow: 'hidden',
                  })}
                >
                  <Box
                    component="button"
                    className="saved-address"
                    type="button"
                    onClick={() => void submit(session.address)}
                    sx={(theme) => ({
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      minHeight: 34,
                      px: 1.25,
                      border: 0,
                      bgcolor: 'transparent',
                      color: theme.palette.m3.onSurface,
                      fontFamily: MONO_FONT_FAMILY,
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      '&:hover': {
                        bgcolor: theme.palette.m3.surfaceContainerHigh,
                      },
                    })}
                  >
                    {session.protected && <AppIcon name="lock" />}
                    {session.address}
                  </Box>
                  <Box
                    component="button"
                    className="forget-button"
                    type="button"
                    aria-label={t('address.forget', { address: session.address })}
                    onClick={() => forget(session.address)}
                    sx={(theme) => ({
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      minHeight: 34,
                      border: 0,
                      borderLeft: `1px solid ${theme.palette.m3.outlineVariant}`,
                      bgcolor: 'transparent',
                      color: theme.palette.m3.onSurfaceVariant,
                      cursor: 'pointer',
                      flexShrink: 0,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.error.main, 0.12),
                        color: theme.palette.error.main,
                      },
                    })}
                  >
                    <AppIcon name="x" />
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography
              component="p"
              className="empty-copy"
              sx={(theme) => ({
                fontSize: '0.875rem',
                color: theme.palette.m3.onSurfaceVariant,
                m: 0,
              })}
            >
              {t('address.savedHelp')}
            </Typography>
          )}
        </Box>
      </Box>

      <Box
        component="section"
        className="how-it-works"
        aria-label={t('how.title')}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: { xs: 1.5, md: 2 },
          mt: { xs: 2, md: 2.5 },
          width: '100%',
        }}
      >
        <Paper
          className="how-step-card"
          sx={(theme) => ({
            p: { xs: 2.5, md: 3 },
            borderRadius: '28px',
            bgcolor: theme.palette.m3.surfaceContainerLow,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
          })}
        >
          <Box
            className="how-step-icon"
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: '14px',
              bgcolor: theme.palette.m3.primaryContainer,
              color: theme.palette.m3.onPrimaryContainer,
            })}
          >
            <AppIcon name="mail-plus" />
          </Box>
          <Typography component="h3" variant="subtitle1" sx={{ m: 0, fontWeight: 500 }}>
            {t('how.step1Title')}
          </Typography>
          <Typography component="p" variant="body2" color="text.secondary" sx={{ m: 0 }}>
            {t('how.step1Desc')}
          </Typography>
        </Paper>

        <Paper
          className="how-step-card how-step-code"
          sx={(theme) => ({
            p: { xs: 2.5, md: 3 },
            borderRadius: '28px',
            bgcolor: theme.palette.m3.surfaceContainerLow,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
          })}
        >
          <Box
            className="how-step-icon"
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: '14px',
              bgcolor: theme.palette.m3.secondaryContainer,
              color: theme.palette.m3.onSecondaryContainer,
            })}
          >
            <AppIcon name="badge-check" />
          </Box>
          <Typography component="h3" variant="subtitle1" sx={{ m: 0, fontWeight: 500 }}>
            {t('how.step2Title')}
          </Typography>
          <Typography component="p" variant="body2" color="text.secondary" sx={{ m: 0 }}>
            {t('how.step2Desc')}
          </Typography>
        </Paper>

        <Paper
          className="how-step-card how-step-privacy"
          sx={(theme) => ({
            p: { xs: 2.5, md: 3 },
            borderRadius: '28px',
            bgcolor: theme.palette.m3.surfaceContainerLow,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
          })}
        >
          <Box
            className="how-step-icon"
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: '14px',
              bgcolor: theme.palette.m3.primaryContainer,
              color: theme.palette.m3.onPrimaryContainer,
            })}
          >
            <AppIcon name="shield-check" />
          </Box>
          <Typography component="h3" variant="subtitle1" sx={{ m: 0, fontWeight: 500 }}>
            {t('how.step3Title')}
          </Typography>
          <Typography component="p" variant="body2" color="text.secondary" sx={{ m: 0 }}>
            {t('how.step3Desc')}
          </Typography>
        </Paper>
      </Box>
    </>
  )
}

export default AddressPanel
