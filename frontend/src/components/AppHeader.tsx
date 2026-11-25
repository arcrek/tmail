import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { useI18n, type Locale } from '../i18n'
import { AppIcon } from './AppIcon'
import { ThemeToggle } from './ThemeToggle'
import { UnlockControl } from './UnlockControl'

export interface AppHeaderProps {
  appName?: string
  logoDataUrl?: string
  showLocalePicker?: boolean
  showUnlock?: boolean
  accessToken?: string
  unlocking?: boolean
  bulkActive?: boolean
  bulkCodeActive?: boolean
  homeActive?: boolean
  unlockOpen: boolean
  unlockValue: string
  onUnlockOpenChange: (open: boolean) => void
  onUnlockValueChange: (value: string) => void
  onHome: () => void
  onUnlock: () => void
  onLock: () => void
  onBulk: () => void
  onBulkCode: () => void
}

const LOCALE_NAMES: Record<Locale, 'locale.english' | 'locale.vietnamese' | 'locale.russian' | 'locale.chinese'> = {
  en: 'locale.english',
  vi: 'locale.vietnamese',
  ru: 'locale.russian',
  zh: 'locale.chinese',
}

export function AppHeader({
  appName = '',
  logoDataUrl = '',
  showLocalePicker = true,
  showUnlock = true,
  accessToken = '',
  unlocking = false,
  bulkActive = false,
  bulkCodeActive = false,
  homeActive,
  unlockOpen,
  unlockValue,
  onUnlockOpenChange,
  onUnlockValueChange,
  onHome,
  onUnlock,
  onLock,
  onBulk,
  onBulkCode,
}: AppHeaderProps) {
  const { locale, selectLocale, t } = useI18n()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const localeName = t(LOCALE_NAMES[locale])

  function closeMobileMenu(): void {
    setMobileOpen(false)
  }

  function toggleMobileMenu(): void {
    setMobileOpen((prev) => !prev)
  }

  // The toggle sits after the nav in DOM order (it lives with the always-visible header
  // actions), so move focus into the menu it just opened instead of leaving Tab to exit.
  useEffect(() => {
    if (mobileOpen) {
      navRef.current?.querySelector<HTMLElement>('a')?.focus()
    }
  }, [mobileOpen])

  useEffect(() => {
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && mobileOpen) {
        setMobileOpen(false)
        document.querySelector<HTMLElement>('.mobile-menu-button')?.focus()
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [mobileOpen])

  function onBrandClick(event: MouseEvent<HTMLAnchorElement>): void {
    closeMobileMenu()
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onHome()
  }

  function onHomeClick(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault()
    closeMobileMenu()
    onHome()
  }

  function onBulkClick(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault()
    closeMobileMenu()
    onBulk()
  }

  function onBulkCodeClick(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault()
    closeMobileMenu()
    onBulkCode()
  }

  function onLocaleChange(event: ChangeEvent<HTMLSelectElement>): void {
    selectLocale(event.target.value)
  }

  const navLinkSx = (active?: boolean) => (theme: import('@mui/material/styles').Theme) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
    minHeight: { xs: 44, md: 40 },
    px: 1.75,
    py: 0.75,
    borderRadius: 9999,
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    width: { xs: '100%', md: 'auto' },
    bgcolor: active ? theme.palette.m3.secondaryContainer : 'transparent',
    color: active ? theme.palette.m3.onSecondaryContainer : theme.palette.m3.onSurfaceVariant,
    transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1)',
    '&:hover': {
      bgcolor: active ? theme.palette.m3.secondaryContainer : theme.palette.m3.surfaceContainerHigh,
      color: active ? theme.palette.m3.onSecondaryContainer : theme.palette.m3.onSurface,
    },
  })

  return (
    <Box
      component="header"
      className="app-header"
      sx={(theme) => ({
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        display: 'flex',
        flexWrap: { xs: 'wrap', md: 'nowrap' },
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: { xs: 1, md: 2 },
        width: '100%',
        maxWidth: '100%',
        minHeight: { xs: 60, md: 68 },
        px: { xs: 1.5, sm: 2, md: 3 },
        py: 1,
        bgcolor: theme.palette.m3.surface,
        borderBottom: `1px solid ${theme.palette.m3.outlineVariant}`,
      })}
    >
      <Box
        component="a"
        className="brand"
        href="/"
        onClick={onBrandClick}
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1.25,
          minWidth: 0,
          flex: { xs: '1 1 0%', md: '0 0 auto' },
          textDecoration: 'none',
          color: theme.palette.m3.onSurface,
          borderRadius: '12px',
          py: 0.5,
          pr: 0.5,
        })}
      >
        {logoDataUrl ? (
          <Box
            component="img"
            src={logoDataUrl}
            alt=""
            sx={{
              height: 32,
              width: 'auto',
              maxWidth: { xs: 110, sm: 160 },
              objectFit: 'contain',
              display: 'block',
              flexShrink: 0,
            }}
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
              flexShrink: 0,
              bgcolor: theme.palette.m3.primaryContainer,
              color: theme.palette.m3.onPrimaryContainer,
            })}
          >
            <AppIcon name="brand-mail" />
          </Box>
        )}
        <Box
          component="span"
          className="brand-name"
          sx={{
            fontSize: { xs: '0.95rem', sm: '1.05rem' },
            fontWeight: 600,
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {appName || t('app.defaultName')}
        </Box>
      </Box>

      <Box
        component="nav"
        ref={navRef}
        id="app-header-nav"
        className={mobileOpen ? 'app-header-nav mobile-open' : 'app-header-nav'}
        aria-label={t('nav.site')}
        sx={(theme) => ({
          display: { xs: mobileOpen ? 'flex' : 'none', md: 'flex' },
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          gap: { xs: 0.5, md: 0.5 },
          order: { xs: 3, md: 2 },
          width: { xs: '100%', md: 'auto' },
          flex: { md: '1 1 auto' },
          justifyContent: { md: 'center' },
          p: { xs: 1.25, md: 0 },
          mt: { xs: 0.5, md: 0 },
          borderRadius: { xs: '20px', md: 0 },
          bgcolor: { xs: theme.palette.m3.surfaceContainerLow, md: 'transparent' },
          border: { xs: `1px solid ${theme.palette.m3.outlineVariant}`, md: 0 },
        })}
      >
        <Box
          component="a"
          className="home-link"
          href="/"
          aria-current={homeActive ? 'page' : undefined}
          onClick={onHomeClick}
          sx={navLinkSx(homeActive)}
        >
          <AppIcon name="home" />
          {t('nav.home')}
        </Box>
        <Box
          component="a"
          className="bulk-link"
          href="#"
          aria-current={bulkActive ? 'page' : undefined}
          onClick={onBulkClick}
          sx={navLinkSx(bulkActive)}
        >
          <AppIcon name="mails" />
          {t('nav.bulk')}
        </Box>
        <Box
          component="a"
          className="bulk-code-link"
          href="#"
          aria-current={bulkCodeActive ? 'page' : undefined}
          onClick={onBulkCodeClick}
          sx={navLinkSx(bulkCodeActive)}
        >
          <AppIcon name="scan-code" />
          {t('nav.bulkCode')}
        </Box>
        <Box
          component="a"
          href="/docs"
          onClick={closeMobileMenu}
          sx={navLinkSx(false)}
        >
          <AppIcon name="book-open" />
          {t('nav.docs')}
        </Box>
        {showUnlock && (
          <UnlockControl
            inputId="header-access-credential"
            accessToken={accessToken}
            unlocking={unlocking}
            open={unlockOpen}
            value={unlockValue}
            onOpenChange={onUnlockOpenChange}
            onValueChange={onUnlockValueChange}
            onUnlock={onUnlock}
            onLock={onLock}
          />
        )}
      </Box>

      <Box
        className="header-actions"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: { xs: 0.25, sm: 0.5 },
          order: { xs: 2, md: 3 },
          flexShrink: 0,
        }}
      >
        {showLocalePicker && (
          <Box
            component="label"
            className="locale-picker"
            sx={(theme) => ({
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              minHeight: { xs: 44, md: 40 },
              px: { xs: 1, sm: 1.5 },
              borderRadius: 9999,
              color: theme.palette.m3.onSurfaceVariant,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1)',
              '&:hover': {
                bgcolor: theme.palette.m3.surfaceContainerHigh,
                color: theme.palette.m3.onSurface,
              },
              '&:focus-within': {
                outline: `3px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            })}
          >
            <AppIcon name="globe" />
            <Box
              component="span"
              className="locale-current locale-current-long"
              aria-hidden="true"
              sx={{
                display: { xs: 'none', sm: 'inline' },
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {localeName}
            </Box>
            <Box
              component="span"
              className="locale-current locale-current-short"
              aria-hidden="true"
              sx={{
                display: { xs: 'inline', sm: 'none' },
                fontSize: '0.8125rem',
                fontWeight: 500,
              }}
            >
              {locale.toUpperCase()}
            </Box>
            <AppIcon name="chevron-down" />
            <Box
              component="select"
              value={locale}
              aria-label={t('locale.label')}
              onChange={onLocaleChange}
              sx={(theme) => ({
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer',
                border: 0,
                appearance: 'none',
                bgcolor: theme.palette.m3.surfaceContainerLow,
                color: theme.palette.m3.onSurface,
              })}
            >
              <option value="en">{t('locale.english')}</option>
              <option value="vi">{t('locale.vietnamese')}</option>
              <option value="ru">{t('locale.russian')}</option>
              <option value="zh">{t('locale.chinese')}</option>
            </Box>
          </Box>
        )}

        <ThemeToggle />

        <IconButton
          className="mobile-menu-button icon-button"
          type="button"
          aria-expanded={mobileOpen}
          aria-label={t('nav.toggleMenu')}
          aria-controls="app-header-nav"
          onClick={toggleMobileMenu}
          sx={(theme) => ({
            display: { xs: 'inline-flex', md: 'none' },
            color: mobileOpen ? theme.palette.m3.onSecondaryContainer : theme.palette.m3.onSurfaceVariant,
            bgcolor: mobileOpen ? theme.palette.m3.secondaryContainer : 'transparent',
            '&:hover': {
              bgcolor: theme.palette.m3.surfaceContainerHigh,
            },
          })}
        >
          <AppIcon name={mobileOpen ? 'x' : 'menu'} />
          <span className="sr-only">{t('nav.menu')}</span>
        </IconButton>
      </Box>
    </Box>
  )
}

export default AppHeader
