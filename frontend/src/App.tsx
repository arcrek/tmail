import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import CssBaseline from '@mui/material/CssBaseline'
import InputLabel from '@mui/material/InputLabel'
import Link from '@mui/material/Link'
import OutlinedInput from '@mui/material/OutlinedInput'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { ThemeProvider } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { clearAccessToken, loadAccessToken, saveAccessToken } from './access'
import { ApiError, api } from './api'
import AddressPanel from './components/AddressPanel'
import AppHeader from './components/AppHeader'
import InboxView from './components/InboxView'
import MailboxPasswordDialog from './components/MailboxPasswordDialog'
import SandboxFrame from './components/SandboxFrame'
import ToastStack from './components/ToastStack'
import { setSiteLocale, useI18n } from './i18n'
import { authorizationFailed, openMailbox, validPassword } from './mailbox-access'
import { createTMailTheme, MONO_FONT_FAMILY } from './muiTheme'
import { parseRoute } from './route'
import { loadSessions, removeSession, saveSession } from './session'
import { useTheme } from './theme'
import { toastActions } from './toast'
import type { AddressSession, SiteResource } from './types'

const AdminApp = lazy(() => import('./admin/AdminApp'))
const BulkGenerateView = lazy(() => import('./components/BulkGenerateView'))
const BulkCodeView = lazy(() => import('./components/BulkCodeView'))

type View = 'address' | 'inbox' | 'admin' | 'bulk' | 'bulkCode'

function ViewFallback() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        py: 8,
      }}
      aria-live="polite"
    >
      <CircularProgress size={32} />
    </Box>
  )
}

export function App() {
  const initialRoute = useMemo(() => parseRoute(window.location.pathname), [])
  const [view, setView] = useState<View>(initialRoute.name === 'admin' ? 'admin' : 'address')
  const [current, setCurrent] = useState<AddressSession | null>(null)
  const [loginAddress, setLoginAddress] = useState('')
  const [mailboxPassword, setMailboxPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginPending, setLoginPending] = useState(false)
  const [passwordSession, setPasswordSession] = useState<AddressSession | null>(null)
  const [site, setSite] = useState<SiteResource | null>(null)
  const [loading, setLoading] = useState(initialRoute.name === 'address')
  const [accessToken, setAccessToken] = useState(() => loadAccessToken())
  const [unlocking, setUnlocking] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockValue, setUnlockValue] = useState('')

  const { locale, t } = useI18n()
  const { resolved: themeMode } = useTheme()

  const muiTheme = useMemo(
    () =>
      createTMailTheme(themeMode, {
        primaryColor: site?.primaryColor,
        accentColor: site?.accentColor,
      }),
    [themeMode, site?.primaryColor, site?.accentColor],
  )

  const navigationVersionRef = useRef(0)
  const pendingMailboxAddressRef = useRef('')
  const pendingSavedTokenRef = useRef<string | undefined>(undefined)
  const siteVersionRef = useRef(0)

  const currentRef = useRef<AddressSession | null>(current)
  currentRef.current = current
  const passwordSessionRef = useRef<AddressSession | null>(passwordSession)
  passwordSessionRef.current = passwordSession
  const accessTokenRef = useRef(accessToken)
  accessTokenRef.current = accessToken
  const loginAddressRef = useRef(loginAddress)
  loginAddressRef.current = loginAddress
  const tRef = useRef(t)
  tRef.current = t

  // Capture original document globals once on mount and restore on unmount.
  const originalGlobalsRef = useRef<{
    language: string | null
    primary: string
    accent: string
    title: string
    favicon: HTMLLinkElement | null
    faviconHref: string | null
    createdFavicon: HTMLLinkElement | null
  } | null>(null)

  if (originalGlobalsRef.current === null && typeof document !== 'undefined') {
    const root = document.documentElement
    const originalFavicon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    originalGlobalsRef.current = {
      language: root.getAttribute('lang'),
      primary: root.style.getPropertyValue('--brand-primary'),
      accent: root.style.getPropertyValue('--brand-accent'),
      title: document.title,
      favicon: originalFavicon,
      faviconHref: originalFavicon?.getAttribute('href') ?? null,
      createdFavicon: null,
    }
  }

  useEffect(() => {
    const root = document.documentElement
    root.lang = locale === 'zh' ? 'zh-Hans' : locale
  }, [locale])

  useEffect(() => {
    const originals = originalGlobalsRef.current
    if (!site || !originals) return
    const root = document.documentElement
    root.style.setProperty('--brand-primary', site.primaryColor)
    root.style.setProperty('--brand-accent', site.accentColor)
    setSiteLocale(site.language)
    document.title = site.appName
    if (site.faviconDataUrl) {
      let fav = originals.favicon ?? originals.createdFavicon
      if (!fav) {
        fav = document.createElement('link')
        fav.rel = 'icon'
        fav.dataset.tmailFavicon = ''
        document.head.append(fav)
        originals.createdFavicon = fav
      }
      fav.setAttribute('href', site.faviconDataUrl)
    } else if (originals.createdFavicon) {
      originals.createdFavicon.remove()
      originals.createdFavicon = null
    } else if (originals.favicon) {
      if (originals.faviconHref === null) originals.favicon.removeAttribute('href')
      else originals.favicon.setAttribute('href', originals.faviconHref)
    }
  }, [site])

  useEffect(() => {
    return () => {
      const originals = originalGlobalsRef.current
      if (!originals) return
      const root = document.documentElement
      if (originals.primary) root.style.setProperty('--brand-primary', originals.primary)
      else root.style.removeProperty('--brand-primary')
      if (originals.accent) root.style.setProperty('--brand-accent', originals.accent)
      else root.style.removeProperty('--brand-accent')
      if (originals.language === null) root.removeAttribute('lang')
      else root.setAttribute('lang', originals.language)
      document.title = originals.title
      if (originals.createdFavicon) {
        originals.createdFavicon.remove()
        originals.createdFavicon = null
      } else if (originals.favicon) {
        if (originals.faviconHref === null) originals.favicon.removeAttribute('href')
        else originals.favicon.setAttribute('href', originals.faviconHref)
      }
    }
  }, [])

  const adSlots = useMemo(
    () =>
      Object.entries(site?.adSlots ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1]),
      ),
    [site],
  )

  const openInbox = useCallback((session: AddressSession, updatePath = true): void => {
    currentRef.current = session
    setCurrent(session)
    saveSession(session)
    setView('inbox')
    const path = `/${encodeURIComponent(session.address)}`
    if (updatePath && location.pathname !== path) history.pushState({}, '', path)
  }, [])

  const openCreatedInbox = useCallback(
    (session: AddressSession): void => {
      navigationVersionRef.current += 1
      loginAddressRef.current = ''
      setLoginAddress('')
      setMailboxPassword('')
      openInbox(session)
    },
    [openInbox],
  )

  const promptMailbox = useCallback((address: string, error = ''): void => {
    navigationVersionRef.current += 1
    currentRef.current = null
    setCurrent(null)
    setLoading(false)
    setLoginPending(false)
    loginAddressRef.current = address
    setLoginAddress(address)
    pendingMailboxAddressRef.current = ''
    setMailboxPassword('')
    setLoginError(error)
    setView('address')
    const path = `/${encodeURIComponent(address)}`
    if (location.pathname !== path) history.pushState({}, '', path)
  }, [])

  const enterMailbox = useCallback(
    async (address: string, password?: string): Promise<void> => {
      const version = ++navigationVersionRef.current
      pendingMailboxAddressRef.current = address
      pendingSavedTokenRef.current = loadSessions().find((saved) => saved.address === address)?.token
      currentRef.current = null
      setCurrent(null)
      setLoading(password === undefined)
      setLoginPending(password !== undefined)
      try {
        const session = await openMailbox(address, accessTokenRef.current || undefined, password)
        if (version === navigationVersionRef.current) {
          loginAddressRef.current = ''
          setLoginAddress('')
          openInbox(session, false)
        }
      } catch (cause) {
        if (version !== navigationVersionRef.current) return
        if (authorizationFailed(cause)) {
          promptMailbox(address, password === undefined ? tRef.current('password.required') : tRef.current('password.invalid'))
        } else if (loginAddressRef.current) {
          setLoginError(cause instanceof ApiError ? cause.message : tRef.current('error.unavailable'))
        } else {
          toastActions.error(cause instanceof ApiError ? cause.message : tRef.current('error.unavailable'))
        }
      } finally {
        if (version === navigationVersionRef.current) {
          setLoading(false)
          setLoginPending(false)
          pendingMailboxAddressRef.current = ''
        }
      }
    },
    [openInbox, promptMailbox],
  )

  const signInMailbox = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault()
      if (loginPending) return
      if (!validPassword(mailboxPassword)) {
        setLoginError(t('password.length'))
        return
      }
      const password = mailboxPassword
      setMailboxPassword('')
      await enterMailbox(loginAddress, password)
    },
    [enterMailbox, loginAddress, loginPending, mailboxPassword, t],
  )

  const invalidateMailbox = useCallback(
    (preserveDialog = false): void => {
      const session = currentRef.current ?? passwordSessionRef.current
      if (!session) return
      if (loadSessions().find((saved) => saved.address === session.address)?.token === session.token) {
        removeSession(session.address)
      }
      if (!preserveDialog) {
        passwordSessionRef.current = null
        setPasswordSession(null)
      }
      promptMailbox(session.address, tRef.current('password.changed'))
    },
    [promptMailbox],
  )

  const updatePassword = useCallback(
    (session: AddressSession): void => {
      passwordSessionRef.current = null
      setPasswordSession(null)
      openCreatedInbox(session)
      toastActions.success(tRef.current('password.saved'))
    },
    [openCreatedInbox],
  )

  const logoutMailbox = useCallback(async (): Promise<void> => {
    const session = currentRef.current
    if (!session) return
    removeSession(session.address)
    promptMailbox(session.address)
    try {
      if (session.accessKind === 'admin' && session.csrf) await api.admin.logout(session.csrf)
      else if (session.accessKind !== 'public') await api.logout(session.token)
      toastActions.success(tRef.current('password.loggedOut'))
    } catch {
      toastActions.error(tRef.current('password.logoutUnconfirmed'))
    }
  }, [promptMailbox])

  const reconcileRoute = useCallback(async (): Promise<void> => {
    ++navigationVersionRef.current
    pendingMailboxAddressRef.current = ''
    const route = parseRoute(window.location.pathname)
    passwordSessionRef.current = null
    setPasswordSession(null)
    loginAddressRef.current = ''
    setLoginAddress('')
    setMailboxPassword('')
    currentRef.current = null
    setCurrent(null)
    setLoading(false)

    if (route.name === 'admin') {
      setView('admin')
      return
    }
    if (route.name !== 'address') {
      setView('address')
      return
    }

    setView('address')
    await enterMailbox(route.address)
  }, [enterMailbox])

  const newAddress = useCallback((): void => {
    navigationVersionRef.current += 1
    pendingMailboxAddressRef.current = ''
    setLoading(false)
    currentRef.current = null
    setCurrent(null)
    passwordSessionRef.current = null
    setPasswordSession(null)
    loginAddressRef.current = ''
    setLoginAddress('')
    setMailboxPassword('')
    setView('address')
    if (location.pathname !== '/') history.pushState({}, '', '/')
  }, [])

  const openBulk = useCallback((): void => {
    navigationVersionRef.current += 1
    pendingMailboxAddressRef.current = ''
    currentRef.current = null
    setCurrent(null)
    passwordSessionRef.current = null
    setPasswordSession(null)
    setView('bulk')
  }, [])

  const openBulkCode = useCallback((): void => {
    navigationVersionRef.current += 1
    pendingMailboxAddressRef.current = ''
    currentRef.current = null
    setCurrent(null)
    passwordSessionRef.current = null
    setPasswordSession(null)
    setView('bulkCode')
  }, [])

  const unlock = useCallback(async (): Promise<void> => {
    setUnlocking(true)
    try {
      const response = await api.unlock(unlockValue)
      saveAccessToken(response.accessToken)
      accessTokenRef.current = response.accessToken
      setAccessToken(response.accessToken)
      setUnlockValue('')
      setUnlockOpen(false)
    } catch (cause) {
      toastActions.error(
        cause instanceof ApiError && cause.status === 401
          ? tRef.current('unlock.invalid')
          : tRef.current('unlock.failed'),
      )
    } finally {
      setUnlocking(false)
    }
  }, [unlockValue])

  const lock = useCallback(async (): Promise<void> => {
    try {
      await api.lock(accessTokenRef.current)
    } catch {
      // Lock locally even when the server cannot be reached.
    }
    clearAccessToken()
    accessTokenRef.current = ''
    setAccessToken('')
  }, [])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'tmail.addresses' && event.key !== null) return
      const session = currentRef.current
      if (!session) {
        const pendingAddr = pendingMailboxAddressRef.current
        if (pendingAddr && loadSessions().find((saved) => saved.address === pendingAddr)?.token !== pendingSavedTokenRef.current) {
          passwordSessionRef.current = null
          setPasswordSession(null)
          promptMailbox(pendingAddr, tRef.current('password.changed'))
        }
        return
      }
      if (session.accessKind === 'public' || session.accessKind === 'admin') return
      const saved = loadSessions().find((value) => value.address === session.address)
      if (saved?.token === session.token) return
      passwordSessionRef.current = null
      setPasswordSession(null)
      promptMailbox(session.address, tRef.current('password.changed'))
      if (saved) void enterMailbox(session.address)
    }

    const handleAdminLogout = () => {
      if (currentRef.current?.accessKind === 'admin') invalidateMailbox()
    }

    const handlePopState = () => {
      void reconcileRoute()
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('storage', handleStorage)
    window.addEventListener('tmail-admin-logout', handleAdminLogout)

    const version = ++siteVersionRef.current
    void api
      .site()
      .then((value) => {
        if (version === siteVersionRef.current) setSite(value)
      })
      .catch(() => {
        // Site customization is optional; core mail remains available.
      })

    void reconcileRoute()

    return () => {
      navigationVersionRef.current += 1
      siteVersionRef.current += 1
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('tmail-admin-logout', handleAdminLogout)
    }
  }, [enterMailbox, invalidateMailbox, promptMailbox, reconcileRoute])

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box
        className="app-frame"
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: (theme) => theme.palette.m3.surface,
          color: (theme) => theme.palette.m3.onSurface,
        }}
      >
        <a className="skip-link" href="#main-content">
          {t('a11y.skipToContent')}
        </a>

        {site?.headerHtml ? (
          <SandboxFrame
            className="site-content-frame site-header-frame"
            html={site.headerHtml}
            css={site.contentCss}
            mode="content"
            title={t('app.header')}
          />
        ) : null}

        {view !== 'admin' ? (
          <AppHeader
            appName={site?.appName}
            logoDataUrl={site?.logoDataUrl}
            accessToken={accessToken}
            unlocking={unlocking}
            bulkActive={view === 'bulk'}
            bulkCodeActive={view === 'bulkCode'}
            homeActive={view === 'address' || view === 'inbox'}
            unlockOpen={unlockOpen}
            unlockValue={unlockValue}
            onUnlockOpenChange={setUnlockOpen}
            onUnlockValueChange={setUnlockValue}
            onHome={newAddress}
            onUnlock={unlock}
            onLock={lock}
            onBulk={openBulk}
            onBulkCode={openBulkCode}
          />
        ) : null}

        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          sx={{
            flex: 1,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {adSlots.map(([name, html]) => (
            <SandboxFrame
              key={name}
              className="site-content-frame ad-frame"
              html={html}
              css={site?.contentCss}
              mode="content"
              title={t('app.content', { name })}
            />
          ))}

          {view === 'admin' ? (
            <Suspense fallback={<ViewFallback />}>
              <AdminApp
                onSiteUpdated={(updated) => {
                  setSite((prev) =>
                    prev
                      ? { ...prev, ...updated }
                      : {
                          appName: updated.appName,
                          logoDataUrl: updated.logoDataUrl,
                          faviconDataUrl: updated.faviconDataUrl,
                          primaryColor: updated.primaryColor,
                          accentColor: updated.accentColor,
                          language: updated.language,
                          cookieEnabled: updated.cookieEnabled,
                          cookieText: updated.cookieText,
                          fetchSeconds: updated.fetchSeconds,
                          messageLimit: updated.messageLimit,
                          headerHtml: updated.headerHtml,
                          footerHtml: updated.footerHtml,
                          contentCss: updated.contentCss,
                          adSlots: updated.adSlots,
                        },
                  )
                }}
              />
            </Suspense>
          ) : (
            <Box
              className={view === 'inbox' ? 'page inbox-page' : 'page'}
              sx={{
                flex: 1,
                width: '100%',
                maxWidth: view === 'inbox' ? 1400 : 1120,
                mx: 'auto',
                px: { xs: 1.5, sm: 2, md: 3 },
                py: { xs: 2, md: 3 },
              }}
            >
              {view === 'inbox' && current ? (
                <InboxView
                  session={current}
                  accessToken={accessToken}
                  fetchSeconds={site?.fetchSeconds ?? 5}
                  onCreate={openCreatedInbox}
                  onLogin={promptMailbox}
                  onInvalid={() => invalidateMailbox(Boolean(passwordSessionRef.current))}
                  onManage={() => {
                    passwordSessionRef.current = current
                    setPasswordSession(current)
                  }}
                  onLogout={logoutMailbox}
                />
              ) : view === 'bulk' ? (
                <Suspense fallback={<ViewFallback />}>
                  <BulkGenerateView accessToken={accessToken} />
                </Suspense>
              ) : view === 'bulkCode' ? (
                <Suspense fallback={<ViewFallback />}>
                  <BulkCodeView accessToken={accessToken} fetchSeconds={site?.fetchSeconds ?? 5} />
                </Suspense>
              ) : loading ? (
                <Paper
                  component="section"
                  className="handoff-loading"
                  aria-live="polite"
                  sx={{
                    maxWidth: 640,
                    mx: 'auto',
                    p: { xs: 2.5, sm: 4 },
                    borderRadius: '28px',
                    bgcolor: (theme) => theme.palette.m3.surfaceContainerLow,
                  }}
                >
                  <Stack spacing={2}>
                    <Skeleton variant="text" width="35%" height={24} className="skeleton skeleton-label" />
                    <Skeleton variant="text" width="70%" height={40} className="skeleton skeleton-title" />
                    <Skeleton variant="rounded" width="100%" height={56} className="skeleton skeleton-field" />
                  </Stack>
                  <span className="sr-only">{t('app.opening')}</span>
                </Paper>
              ) : loginAddress ? (
                <Paper
                  component="section"
                  className="panel mailbox-login"
                  aria-labelledby="mailbox-login-title"
                  sx={{
                    width: '100%',
                    maxWidth: 460,
                    mx: 'auto',
                    p: { xs: 2.5, sm: 3.5 },
                    borderRadius: '28px',
                    bgcolor: (theme) => theme.palette.m3.surfaceContainerLow,
                  }}
                >
                  <Stack spacing={2}>
                    <Typography
                      component="h1"
                      id="mailbox-login-title"
                      sx={{
                        fontSize: { xs: '1.5rem', sm: '1.75rem' },
                        fontWeight: 500,
                        lineHeight: 1.2,
                        m: 0,
                      }}
                    >
                      {t('password.login')}
                    </Typography>

                    <Typography
                      component="p"
                      className="mailbox-address"
                      sx={{
                        fontFamily: MONO_FONT_FAMILY,
                        fontSize: '0.9375rem',
                        color: (theme) => theme.palette.m3.onSurfaceVariant,
                        wordBreak: 'break-all',
                        m: 0,
                        mb: '0px',
                      }}
                    >
                      {loginAddress}
                    </Typography>

                    <Box
                      component="form"
                      className="settings-form"
                      onSubmit={signInMailbox}
                      sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
                    >
                      <input type="hidden" name="username" autoComplete="username" value={loginAddress} />
                      <Box className="field" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <InputLabel
                          htmlFor="mailbox-login-password"
                          sx={{
                            position: 'static',
                            transform: 'none',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: (theme) => theme.palette.m3.onSurface,
                          }}
                        >
                          {t('password.label')}
                        </InputLabel>
                        <OutlinedInput
                          id="mailbox-login-password"
                          type="password"
                          name="password"
                          autoComplete="current-password"
                          required
                          fullWidth
                          size="small"
                          disabled={loginPending}
                          value={mailboxPassword}
                          onChange={(e) => setMailboxPassword(e.target.value)}
                          error={Boolean(loginError)}
                          inputProps={{
                            'aria-invalid': Boolean(loginError),
                            'aria-describedby': 'mailbox-login-error mailbox-login-help',
                          }}
                        />
                      </Box>

                      <Typography
                        component="p"
                        id="mailbox-login-help"
                        variant="body2"
                        sx={{
                          color: (theme) => theme.palette.m3.onSurfaceVariant,
                          m: 0,
                          mb: '0px',
                        }}
                      >
                        {t('password.length')}
                      </Typography>

                      <Typography
                        component="p"
                        id="mailbox-login-error"
                        role="alert"
                        className="reader-error"
                        variant="body2"
                        sx={{
                          color: (theme) => theme.palette.error.main,
                          minHeight: loginError ? 'auto' : 0,
                          m: 0,
                          mb: '0px',
                        }}
                      >
                        {loginError}
                      </Typography>

                      <Button
                        className="primary-button"
                        type="submit"
                        variant="contained"
                        color="primary"
                        disabled={loginPending}
                        sx={{ minHeight: 44 }}
                      >
                        {loginPending ? t('password.busy') : t('password.submit')}
                      </Button>

                      <Button
                        className="text-button"
                        type="button"
                        variant="text"
                        disabled={loginPending}
                        onClick={() => void enterMailbox(loginAddress)}
                        sx={{ minHeight: 44 }}
                      >
                        {t('password.retry')}
                      </Button>
                    </Box>
                  </Stack>
                </Paper>
              ) : (
                <AddressPanel accessToken={accessToken} onOpen={openCreatedInbox} onLogin={promptMailbox} />
              )}
            </Box>
          )}
        </Box>

        {view !== 'admin' ? (
          <Box
            component="footer"
            className="site-footer"
            sx={{
              py: 2.5,
              px: { xs: 2, md: 3 },
              borderTop: (theme) => `1px solid ${theme.palette.m3.outlineVariant}`,
              bgcolor: (theme) => theme.palette.m3.surface,
            }}
          >
            <Stack
              component="nav"
              className="site-footer-links"
              aria-label={t('nav.footer')}
              direction="row"
              spacing={3}
              sx={{
                justifyContent: 'center',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link href="/docs" underline="hover" color="text.secondary" variant="body2">
                {t('nav.docs')}
              </Link>
              <Link className="admin-link" href="/admin" underline="hover" color="text.secondary" variant="body2">
                {t('nav.admin')}
              </Link>
            </Stack>
          </Box>
        ) : null}

        {site?.cookieEnabled && site.cookieText ? (
          <Paper
            component="section"
            className="cookie-notice"
            role="status"
            aria-label={t('app.cookie')}
            sx={{
              mx: 'auto',
              mb: 2,
              px: 2.5,
              py: 1.25,
              maxWidth: 760,
              borderRadius: '16px',
              bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
              color: (theme) => theme.palette.m3.onSurfaceVariant,
              fontSize: '0.875rem',
            }}
          >
            {site.cookieText}
          </Paper>
        ) : null}

        {site?.footerHtml ? (
          <SandboxFrame
            className="site-content-frame site-footer-frame"
            html={site.footerHtml}
            css={site.contentCss}
            mode="content"
            title={t('app.footer')}
          />
        ) : null}

        {passwordSession ? (
          <MailboxPasswordDialog
            session={passwordSession}
            onClose={() => {
              passwordSessionRef.current = null
              setPasswordSession(null)
            }}
            onUpdated={updatePassword}
            onInvalid={() => invalidateMailbox(false)}
            onReplacing={() => invalidateMailbox(true)}
          />
        ) : null}

        <ToastStack />
      </Box>
    </ThemeProvider>
  )
}

export default App
