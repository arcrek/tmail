import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useTheme } from '../theme'
import { useI18n } from '../i18n'
import { AppIcon } from './AppIcon'

export function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const { t } = useI18n()

  const label = resolved === 'dark' ? t('theme.light') : t('theme.dark')
  const icon = resolved === 'dark' ? 'sun' : 'moon'

  return (
    <Tooltip title={label}>
      <IconButton
        type="button"
        className="theme-toggle"
        aria-label={label}
        onClick={toggle}
        sx={{
          color: (theme) => theme.palette.m3.onSurfaceVariant,
          '&:hover': {
            bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
          },
        }}
      >
        <AppIcon name={icon} />
      </IconButton>
    </Tooltip>
  )
}

export default ThemeToggle
