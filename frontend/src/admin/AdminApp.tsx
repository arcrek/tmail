import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api } from '../api'
import { AppIcon, type IconName } from '../components/AppIcon'
import { ThemeToggle } from '../components/ThemeToggle'
import { useI18n, type MessageKey } from '../i18n'
import type { AdminSettings } from '../types'
import { AccessTab } from './AccessTab'
import { ContentTab } from './ContentTab'
import { DashboardTab } from './DashboardTab'
import { DeletedMailTab } from './DeletedMailTab'
import { DomainsTab } from './DomainsTab'
import { GeneralTab } from './GeneralTab'
import { MailServerTab } from './MailServerTab'

type Tab = 'dashboard' | 'general' | 'mail' | 'domains' | 'access' | 'content' | 'deleted'
type TabItem = { id: Tab; key: MessageKey; icon: IconName }

// Drawer order follows the two groups; keyboard navigation walks this flat list.
// Indices map directly to id="admin-tab-0" .. id="admin-tab-6".
const tabGroups: Array<{ key: MessageKey; tabs: TabItem[] }> = [
  {
    key: 'admin.groupOperations',
    tabs: [
      { id: 'dashboard', key: 'admin.dashboard', icon: 'layout-dashboard' },
      { id: 'domains', key: 'admin.domains', icon: 'globe' },
      { id: 'deleted', key: 'admin.deleted', icon: 'trash-2' },
    ],
  },
  {
    key: 'admin.groupConfiguration',
    tabs: [
      { id: 'general', key: 'admin.general', icon: 'sliders' },
      { id: 'mail', key: 'admin.mail', icon: 'server' },
      { id: 'access', key: 'admin.access', icon: 'key' },
      { id: 'content', key: 'admin.content', icon: 'code-2' },
    ],
  },
]
const tabs: TabItem[] = tabGroups.flatMap((group) => group.tabs)

export interface AdminAppProps {
  onSiteUpdated?: (site: AdminSettings['site']) => void
}

export function AdminApp({ onSiteUpdated }: AdminAppProps = {}) {
  const { t } = useI18n()

  const handleSettingsUpdated = useCallback(
    (next: AdminSettings) => {
      setSettings(next)
      onSiteUpdated?.(next.site)
    },
    [onSiteUpdated],
  )

  const [password, setPassword] = useState('')
  const [csrf, setCsrf] = useState('')
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [pending, setPending] = useState(false)
  const [childBusy, setChildBusy] = useState(false)
  const [cleanupCsrf, setCleanupCsrf] = useState('')
  const [error, setError] = useState('')
  // MX failures in the last 24 hours from the dashboard's latest load; shown as a badge on the Domains item.
  const [domainAttention, setDomainAttention] = useState(0)

  const appName = settings?.site.appName || t('app.defaultName')
  const logoDataUrl = settings?.site.logoDataUrl || ''

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const session = await api.admin.session()
        const loaded = await api.admin.settings()
        if (!active) return
        setCsrf(session.csrfToken)
        setSettings(loaded)
      } catch {
        // No valid cookie: keep showing the login form.
      }
    })()
    return () => {
      active = false
    }
  }, [])

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (childBusy) return
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    const tab = tabs[next]
    if (!tab) return
    setActiveTab(tab.id)
    const buttons = event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLElement>('[role="tab"]')
    buttons?.[next]?.focus()
  }

  const selectTab = useCallback(
    (tab: Tab): void => {
      if (!childBusy) setActiveTab(tab)
    },
    [childBusy],
  )

  const applyDomainSync = useCallback((domains: string[], lastSync: AdminSettings['lastSync']): void => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            domains: [...domains],
            lastSync: { ...lastSync },
            lastSuccessfulSync: { ...lastSync },
          }
        : prev,
    )
  }, [])

  async function login(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (cleanupCsrf) return
    setPending(true)
    setError('')
    let newCsrf = ''
    let failedCleanup = false
    try {
      const session = await api.admin.login(password)
      newCsrf = session.csrfToken
      const loaded = await api.admin.settings()
      setCsrf(newCsrf)
      setSettings(loaded)
      setPassword('')
    } catch (cause) {
      const loginError = cause instanceof Error ? cause.message : 'Could not sign in.'
      if (newCsrf) {
        try {
          await api.admin.logout(newCsrf)
        } catch (cleanupCause) {
          failedCleanup = true
          setCleanupCsrf(newCsrf)
          const detail = cleanupCause instanceof Error ? cleanupCause.message : 'Cleanup unavailable.'
          setError(`${loginError} Session cleanup failed. ${detail}`)
        }
      }
      setCsrf('')
      setSettings(null)
      if (!failedCleanup) setError(loginError)
    } finally {
      setPassword('')
      setPending(false)
    }
  }

  async function retryCleanup(): Promise<void> {
    const token = cleanupCsrf
    if (!token) return
    setPending(true)
    setError('')
    try {
      await api.admin.logout(token)
      setCleanupCsrf('')
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Cleanup unavailable.'
      setError(`Session cleanup failed. ${detail}`)
    } finally {
      setPending(false)
    }
  }

  async function logout(): Promise<void> {
    if (childBusy) return
    const token = csrf
    setError('')
    if (!token) return
    setPending(true)
    try {
      await api.admin.logout(token)
      window.dispatchEvent(new Event('tmail-admin-logout'))
      setCsrf('')
      setSettings(null)
      setActiveTab('dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not log out.')
    } finally {
      setPending(false)
    }
  }

  if (!settings) {
    return (
      <Box
        component="section"
        className="admin-login"
        aria-labelledby="admin-login-title"
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2, sm: 3 },
          bgcolor: (theme) => theme.palette.m3.surface,
        }}
      >
        <Card
          className="admin-login-panel panel"
          sx={{
            width: '100%',
            maxWidth: 440,
            p: { xs: 3, sm: 4 },
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Stack direction="row" className="admin-login-top" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box
              component="a"
              className="admin-login-brand"
              href="/"
              aria-label={t('admin.viewSite')}
              sx={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            >
              <Box
                component="span"
                className="brand-mark"
                aria-hidden="true"
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
                <AppIcon name="brand-mail" />
              </Box>
            </Box>
            <ThemeToggle />
          </Stack>

          <Box>
            <Typography variant="overline" className="eyebrow" color="text.secondary" sx={{ display: 'block', letterSpacing: '0.08em' }}>
              {t('admin.loginEyebrow')}
            </Typography>
            <Typography
              id="admin-login-title"
              component="h1"
              variant="h4"
              sx={{ fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 500, lineHeight: 1.2 }}
            >
              {t('admin.loginTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" className="admin-note" sx={{ mt: 0.75 }}>
              {t('admin.loginNote')}
            </Typography>
          </Box>

          <Stack component="form" spacing={2} className="settings-form" onSubmit={login}>
            <TextField
              id="admin-password"
              type="password"
              label={t('admin.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
              disabled={pending || Boolean(cleanupCsrf)}
              fullWidth
            />
            <Button
              className="primary-button"
              type="submit"
              variant="contained"
              size="large"
              disabled={pending || Boolean(cleanupCsrf)}
              fullWidth
            >
              {pending ? t('admin.signingIn') : t('admin.signIn')}
            </Button>
            {cleanupCsrf && (
              <Button
                className="secondary-button"
                type="button"
                variant="outlined"
                disabled={pending}
                onClick={() => { void retryCleanup() }}
                fullWidth
              >
                {pending ? t('admin.retryingCleanup') : t('admin.cleanup')}
              </Button>
            )}
            {error && (
              <Alert severity="error" className="admin-error" role="alert" sx={{ borderRadius: '16px' }}>
                {error}
              </Alert>
            )}
          </Stack>
        </Card>
      </Box>
    )
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab)

  return (
    <Box
      className="admin-shell"
      sx={(theme) => ({
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: '280px minmax(0, 1fr)',
        bgcolor: theme.palette.m3.surface,
        '@media (max-width: 952px)': {
          display: 'block',
        },
      })}
    >
      <a className="skip-link" href="#admin-main-content">
        {t('a11y.skipToContent')}
      </a>

      <Box
        component="aside"
        className="admin-sidebar"
        sx={(theme) => ({
          position: 'sticky',
          top: 0,
          height: '100dvh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          p: 2,
          bgcolor: theme.palette.m3.surfaceContainerLow,
          borderRight: `1px solid ${theme.palette.m3.outlineVariant}`,
          '@media (max-width: 952px)': {
            position: 'static',
            height: 'auto',
            overflowY: 'visible',
            borderRight: 0,
            borderBottom: `1px solid ${theme.palette.m3.outlineVariant}`,
            p: 1.5,
            gap: 1.5,
          },
        })}
      >
        <Stack direction="row" spacing={1.25} className="admin-brand" sx={{ alignItems: 'center', px: 0.5 }}>
          {logoDataUrl ? (
            <Box
              component="img"
              src={logoDataUrl}
              alt=""
              sx={{ width: 36, height: 36, borderRadius: '10px', objectFit: 'contain', flexShrink: 0 }}
            />
          ) : (
            <Box
              component="span"
              className="brand-mark"
              aria-hidden="true"
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '12px',
                bgcolor: theme.palette.m3.primaryContainer,
                color: theme.palette.m3.onPrimaryContainer,
                flexShrink: 0,
              })}
            >
              <AppIcon name="brand-mail" />
            </Box>
          )}
          <Box className="admin-brand-text" sx={{ minWidth: 0, flex: 1 }}>
            <Typography className="admin-brand-name" variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
              {appName}
            </Typography>
            <Typography className="admin-brand-caption" variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {t('admin.console')}
            </Typography>
          </Box>
          <ThemeToggle />
        </Stack>

        <Box
          component="nav"
          role="tablist"
          aria-label={t('admin.sections')}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            flex: 1,
            '@media (max-width: 952px)': {
              flexDirection: 'row',
              overflowX: 'auto',
              flexWrap: 'nowrap',
              gap: 1,
              pb: 0.5,
              maxWidth: '100%',
            },
          }}
        >
          {tabGroups.map((group) => (
            <Box
              key={group.key}
              className="admin-nav-group"
              role="none"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                '@media (max-width: 952px)': {
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexShrink: 0,
                  gap: 0.5,
                },
              }}
            >
              <Typography
                component="span"
                className="admin-nav-label"
                aria-hidden="true"
                variant="caption"
                color="text.secondary"
                sx={{
                  px: 1.75,
                  py: 0.5,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  '@media (max-width: 952px)': {
                    display: 'none',
                  },
                }}
              >
                {t(group.key)}
              </Typography>
              {group.tabs.map((tab) => {
                const index = tabs.indexOf(tab)
                const isSelected = activeTab === tab.id
                const showBadge = tab.id === 'domains' && domainAttention > 0
                return (
                  <Box
                    component="button"
                    key={tab.id}
                    id={`admin-tab-${index}`}
                    role="tab"
                    type="button"
                    disabled={childBusy}
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => selectTab(tab.id)}
                    onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => moveTab(e, index)}
                    sx={(theme) => ({
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1.5,
                      width: '100%',
                      minHeight: 52,
                      px: 2,
                      py: 1,
                      border: 0,
                      borderRadius: 9999,
                      cursor: childBusy ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                      fontWeight: isSelected ? 600 : 500,
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      bgcolor: isSelected ? theme.palette.m3.secondaryContainer : 'transparent',
                      color: isSelected ? theme.palette.m3.onSecondaryContainer : theme.palette.m3.onSurfaceVariant,
                      opacity: childBusy ? 0.55 : 1,
                      transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1)',
                      '&:hover': childBusy
                        ? undefined
                        : {
                            bgcolor: isSelected
                              ? theme.palette.m3.secondaryContainer
                              : theme.palette.m3.surfaceContainerHigh,
                            color: isSelected
                              ? theme.palette.m3.onSecondaryContainer
                              : theme.palette.m3.onSurface,
                          },
                      '@media (max-width: 952px)': {
                        width: 'auto',
                        minHeight: 44,
                        px: 1.75,
                      },
                    })}
                  >
                    <AppIcon name={tab.icon} />
                    <span>{t(tab.key)}</span>
                    {showBadge && (
                      <Box component="span" sx={{ ml: 'auto', pl: 1, display: 'inline-flex', alignItems: 'center' }}>
                        <Badge
                          badgeContent={domainAttention}
                          color="error"
                          slotProps={{
                            badge: {
                              className: 'admin-nav-badge',
                              style: { position: 'static', transform: 'none' },
                            },
                          }}
                        />
                        <span className="sr-only"> {t('admin.needsAttention')}</span>
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>

        <Stack
          spacing={1}
          className="admin-account-controls"
          sx={(theme) => ({
            pt: 1.5,
            borderTop: `1px solid ${theme.palette.m3.outlineVariant}`,
            '@media (max-width: 952px)': {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1,
              pt: 1,
            },
          })}
        >
          <Box
            component="a"
            className="admin-public-link"
            href="/"
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              minHeight: 40,
              px: 1.75,
              borderRadius: 9999,
              color: theme.palette.m3.onSurfaceVariant,
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              '&:hover': {
                bgcolor: theme.palette.m3.surfaceContainerHigh,
                color: theme.palette.m3.onSurface,
              },
            })}
          >
            <span>{t('admin.viewSite')}</span>
            <AppIcon name="external-link" />
          </Box>

          <Button
            className="rail-signout"
            type="button"
            variant="outlined"
            disabled={pending || childBusy}
            onClick={() => { void logout() }}
            startIcon={<AppIcon name="log-out" />}
            sx={{ justifyContent: 'flex-start' }}
          >
            {pending ? t('admin.loggingOut') : t('admin.logout')}
          </Button>

          {error && (
            <Alert severity="error" className="admin-error" role="alert" sx={{ borderRadius: '14px', width: '100%' }}>
              {error}
            </Alert>
          )}
        </Stack>
      </Box>

      <Box
        component="section"
        id="admin-main-content"
        className="admin-content"
        tabIndex={-1}
        sx={{
          minWidth: 0,
          p: { xs: 2, sm: 3, md: 4 },
          maxWidth: 1200,
          width: '100%',
        }}
      >
        <Box role="tabpanel" tabIndex={0} aria-labelledby={`admin-tab-${activeIndex}`}>
          {activeTab === 'dashboard' ? (
            <DashboardTab onAttention={setDomainAttention} onOpenDomains={() => selectTab('domains')} />
          ) : activeTab === 'general' ? (
            <GeneralTab site={settings.site} csrf={csrf} onBusyChange={setChildBusy} onUpdated={handleSettingsUpdated} />
          ) : activeTab === 'mail' ? (
            <MailServerTab mailServer={settings.mailServer} csrf={csrf} onBusyChange={setChildBusy} onUpdated={handleSettingsUpdated} />
          ) : activeTab === 'domains' ? (
            <DomainsTab
              site={settings.site}
              domains={settings.domains}
              lastSync={settings.lastSync}
              lastSuccessfulSync={settings.lastSuccessfulSync}
              lastSyncError={settings.lastSyncError}
              csrf={csrf}
              onBusyChange={setChildBusy}
              onSynced={applyDomainSync}
              onUpdated={handleSettingsUpdated}
            />
          ) : activeTab === 'access' ? (
            <AccessTab csrf={csrf} onBusyChange={setChildBusy} />
          ) : activeTab === 'deleted' ? (
            <DeletedMailTab csrf={csrf} onBusyChange={setChildBusy} />
          ) : (
            <ContentTab site={settings.site} csrf={csrf} onBusyChange={setChildBusy} onUpdated={handleSettingsUpdated} />
          )}
        </Box>
      </Box>
    </Box>
  )
}

export default AdminApp
