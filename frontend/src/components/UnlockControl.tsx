import type { FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { alpha } from '@mui/material/styles'
import { useI18n } from '../i18n'
import { AppIcon } from './AppIcon'

export interface UnlockControlProps {
  accessToken: string
  unlocking: boolean
  open: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onValueChange: (value: string) => void
  onUnlock: () => void
  onLock: () => void
  inputId?: string
}

export function UnlockControl({
  accessToken,
  unlocking,
  open,
  value,
  onOpenChange,
  onValueChange,
  onUnlock,
  onLock,
  inputId = 'header-access-credential',
}: UnlockControlProps) {
  const { t } = useI18n()

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onUnlock()
  }

  return (
    <Box
      className="header-unlock"
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: { xs: 'stretch', md: 'center' },
        flexDirection: { xs: 'column', md: 'row' },
        gap: 0.75,
        width: { xs: '100%', md: 'auto' },
      }}
    >
      {accessToken ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'wrap',
          }}
        >
          <Box
            component="span"
            aria-live="polite"
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              px: 1.25,
              py: 0.375,
              borderRadius: '8px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              bgcolor: alpha(theme.palette.m3.success, 0.14),
              color: theme.palette.m3.success,
              whiteSpace: 'nowrap',
            })}
          >
            {t('unlock.unlocked')}
          </Box>
          <Button
            className="text-button"
            type="button"
            variant="text"
            size="small"
            startIcon={<AppIcon name="lock" />}
            onClick={onLock}
            sx={(theme) => ({
              minHeight: 36,
              px: 1.5,
              color: theme.palette.m3.onSurfaceVariant,
              '&:hover': {
                bgcolor: theme.palette.m3.surfaceContainerHigh,
                color: theme.palette.m3.onSurface,
              },
            })}
          >
            {t('unlock.lock')}
          </Button>
        </Box>
      ) : (
        <>
          <Button
            className="text-button"
            type="button"
            variant="text"
            size="small"
            startIcon={<AppIcon name="unlock" />}
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
            sx={(theme) => ({
              minHeight: { xs: 44, md: 36 },
              px: 1.5,
              justifyContent: { xs: 'flex-start', md: 'center' },
              color: open ? theme.palette.m3.onSecondaryContainer : theme.palette.m3.onSurfaceVariant,
              bgcolor: open ? theme.palette.m3.secondaryContainer : 'transparent',
              '&:hover': {
                bgcolor: theme.palette.m3.surfaceContainerHigh,
                color: theme.palette.m3.onSurface,
              },
            })}
          >
            {t('unlock.open')}
          </Button>

          {open && (
            <Box
              component="form"
              className="field"
              onSubmit={handleSubmit}
              sx={(theme) => ({
                position: { xs: 'static', md: 'absolute' },
                top: { md: 'calc(100% + 8px)' },
                right: { md: 0 },
                zIndex: 1200,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                width: { xs: '100%', md: 280 },
                maxWidth: '100%',
                p: 1.75,
                borderRadius: '20px',
                border: `1px solid ${theme.palette.m3.outlineVariant}`,
                bgcolor: theme.palette.m3.surfaceContainerLow,
                boxShadow:
                  theme.palette.mode === 'dark'
                    ? '0 8px 24px rgba(0, 0, 0, 0.45)'
                    : '0 8px 24px rgba(26, 27, 32, 0.12)',
              })}
            >
              <Box
                component="label"
                htmlFor={inputId}
                sx={(theme) => ({
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: theme.palette.m3.onSurfaceVariant,
                })}
              >
                {t('unlock.credential')}
              </Box>
              <Box
                component="input"
                id={inputId}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                type="text"
                name="access-credential"
                placeholder={t('unlock.placeholder')}
                autoComplete="off"
                sx={(theme) => ({
                  width: '100%',
                  minWidth: 0,
                  minHeight: 40,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: '12px',
                  border: `1px solid ${theme.palette.m3.outlineVariant}`,
                  bgcolor: theme.palette.m3.surfaceContainerLowest,
                  color: theme.palette.m3.onSurface,
                  fontFamily: 'inherit',
                  fontSize: '0.875rem',
                  '&:hover': {
                    borderColor: theme.palette.m3.outline,
                  },
                  '&:focus': {
                    borderColor: theme.palette.primary.main,
                  },
                })}
              />
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 0.75,
                }}
              >
                <Button
                  className="text-button"
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="small"
                  disabled={unlocking || !value}
                  sx={{ minHeight: 36, px: 2 }}
                >
                  {unlocking ? t('unlock.unlocking') : t('unlock.submit')}
                </Button>
                <Button
                  className="text-button"
                  type="button"
                  variant="text"
                  size="small"
                  disabled={unlocking}
                  onClick={() => onOpenChange(false)}
                  sx={(theme) => ({
                    minHeight: 36,
                    px: 1.5,
                    color: theme.palette.m3.onSurfaceVariant,
                  })}
                >
                  {t('unlock.cancel')}
                </Button>
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  )
}

export default UnlockControl
