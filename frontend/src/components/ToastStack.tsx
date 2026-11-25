import type { FocusEvent, MouseEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import { alpha } from '@mui/material/styles'
import { useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { useToast } from '../toast'
import { groupCode } from '../verificationCode'
import { AppIcon } from './AppIcon'

export function ToastStack() {
  const { toasts, dismiss, pause, resume } = useToast()
  const { t } = useI18n()

  function onMouseLeave(id: number, event: MouseEvent<HTMLElement>): void {
    const el = event.currentTarget
    if (typeof document !== 'undefined' && document.activeElement && el.contains(document.activeElement)) {
      return
    }
    resume(id)
  }

  function onFocusOut(id: number, event: FocusEvent<HTMLElement>): void {
    const el = event.currentTarget
    const next = event.relatedTarget as Node | null
    if ((next && el.contains(next)) || el.matches?.(':hover')) {
      return
    }
    resume(id)
  }

  return (
    <Box
      className="toast-stack"
      role="region"
      aria-label="Notifications"
      sx={{
        position: 'fixed',
        right: { xs: 12, sm: 20 },
        left: { xs: 12, sm: 'auto' },
        bottom: { xs: 16, sm: 20 },
        zIndex: 1400,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        width: { xs: 'auto', sm: 'min(420px, calc(100vw - 40px))' },
        maxWidth: 'calc(100vw - 24px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const structured = Boolean(toast.code || toast.actions?.length)
        const isError = toast.kind === 'error'
        const isMail = toast.kind === 'mail'
        const iconName = isError ? 'alert-triangle' : isMail ? 'brand-mail' : 'check-circle'
        const classNames = ['toast', `toast-${toast.kind}`]
        if (structured) classNames.push('toast-structured')

        return (
          <Paper
            key={toast.id}
            className={classNames.join(' ')}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            onMouseEnter={() => pause(toast.id)}
            onMouseLeave={(event) => onMouseLeave(toast.id, event)}
            onFocus={() => pause(toast.id)}
            onBlur={(event) => onFocusOut(toast.id, event)}
            sx={(theme) => ({
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: structured ? 1.25 : 0,
              px: 1.75,
              py: 1.375,
              borderRadius: '20px',
              border: '1px solid',
              borderColor: isError ? alpha(theme.palette.error.main, 0.32) : theme.palette.m3.outlineVariant,
              bgcolor: isError ? theme.palette.m3.errorContainer : theme.palette.m3.surfaceContainerLow,
              color: isError ? theme.palette.m3.onErrorContainer : theme.palette.m3.onSurface,
              boxShadow:
                theme.palette.mode === 'dark'
                  ? '0 8px 24px rgba(0, 0, 0, 0.48)'
                  : '0 6px 20px rgba(26, 27, 32, 0.14)',
              transition: 'transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms cubic-bezier(0.2, 0, 0, 1)',
            })}
          >
            <Box
              className="toast-main"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                minWidth: 0,
              }}
            >
              <Box
                component="span"
                className="toast-icon-badge"
                sx={(theme) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '10px',
                  flexShrink: 0,
                  bgcolor: isError
                    ? alpha(theme.palette.error.main, 0.16)
                    : isMail
                      ? theme.palette.m3.primaryContainer
                      : alpha(theme.palette.m3.success, 0.16),
                  color: isError
                    ? theme.palette.m3.onErrorContainer
                    : isMail
                      ? theme.palette.m3.onPrimaryContainer
                      : theme.palette.m3.success,
                })}
              >
                <AppIcon name={iconName} className="toast-icon" />
              </Box>

              <Box
                component="span"
                className="toast-message"
                sx={{
                  flex: '1 1 auto',
                  minWidth: 0,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                {toast.message}
              </Box>

              {toast.code && (
                <Box
                  component="code"
                  className="toast-code"
                  sx={(theme) => ({
                    fontFamily: MONO_FONT_FAMILY,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    letterSpacing: '0.12em',
                    px: 1.25,
                    py: 0.5,
                    borderRadius: '8px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    bgcolor: theme.palette.m3.tertiaryContainer,
                    color: theme.palette.m3.onTertiaryContainer,
                  })}
                >
                  {groupCode(toast.code)}
                </Box>
              )}

              <IconButton
                type="button"
                size="small"
                className="toast-dismiss"
                aria-label={t('toast.dismiss')}
                onClick={() => dismiss(toast.id)}
                sx={(theme) => ({
                  flexShrink: 0,
                  minWidth: 32,
                  minHeight: 32,
                  color: isError ? theme.palette.m3.onErrorContainer : theme.palette.m3.onSurfaceVariant,
                  '&:hover': {
                    bgcolor: isError
                      ? alpha(theme.palette.m3.onErrorContainer, 0.12)
                      : theme.palette.m3.surfaceContainerHigh,
                  },
                })}
              >
                <AppIcon name="x" />
              </IconButton>
            </Box>

            {toast.actions && toast.actions.length > 0 && (
              <Box
                className="toast-actions"
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 1,
                  pl: { xs: 0, sm: 5.5 },
                }}
              >
                {toast.actions.map((action) => (
                  <Button
                    key={action.label}
                    type="button"
                    size="small"
                    className={action.primary ? 'toast-action toast-action-tertiary' : 'toast-action'}
                    onClick={() => {
                      action.onClick()
                      dismiss(toast.id)
                    }}
                    sx={(theme) => ({
                      minHeight: 32,
                      px: 1.75,
                      py: 0.5,
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      borderRadius: 9999,
                      ...(action.primary
                        ? {
                            bgcolor: theme.palette.m3.tertiary,
                            color: theme.palette.m3.onTertiary,
                            '&:hover': {
                              bgcolor: alpha(theme.palette.m3.tertiary, 0.9),
                            },
                          }
                        : {
                            bgcolor: isError
                              ? alpha(theme.palette.m3.onErrorContainer, 0.12)
                              : theme.palette.m3.secondaryContainer,
                            color: isError
                              ? theme.palette.m3.onErrorContainer
                              : theme.palette.m3.onSecondaryContainer,
                            '&:hover': {
                              bgcolor: isError
                                ? alpha(theme.palette.m3.onErrorContainer, 0.2)
                                : theme.palette.m3.surfaceContainerHigh,
                            },
                          }),
                    })}
                  >
                    {action.label}
                  </Button>
                ))}
              </Box>
            )}
          </Paper>
        )
      })}
    </Box>
  )
}

export default ToastStack
