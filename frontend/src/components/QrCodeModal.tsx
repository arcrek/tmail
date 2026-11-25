import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { generateQrMatrix } from '../qrcode'
import { AppIcon } from './AppIcon'

export interface QrCodeModalProps {
  address: string
  onClose: () => void
}

const QUIET_ZONE = 4

export function QrCodeModal({ address, onClose }: QrCodeModalProps) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [copying, setCopying] = useState(false)
  const copyingRef = useRef(false)

  const matrix = useMemo(() => {
    try {
      return generateQrMatrix(address)
    } catch {
      return null
    }
  }, [address])

  const matrixSize = (matrix?.length ?? 0) + QUIET_ZONE * 2

  async function copy(): Promise<void> {
    if (copyingRef.current) return
    copyingRef.current = true
    setCopying(true)
    setCopied(false)
    setCopyError('')
    try {
      await copyText(address)
      setCopied(true)
    } catch {
      setCopyError(t('error.copy'))
    } finally {
      copyingRef.current = false
      setCopying(false)
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (event: Event) => {
      event.preventDefault()
      onCloseRef.current()
    }
    dialog.addEventListener('cancel', handleCancel)

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) {
        try {
          dialog.showModal()
        } catch {
          // Graceful fallback if jsdom or already open
        }
      }
    } else {
      dialog.setAttribute('open', '')
    }

    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      if (typeof dialog.close === 'function') {
        try {
          dialog.close()
        } catch {
          // Ignore if already closed
        }
      } else {
        dialog.removeAttribute('open')
      }
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="tmail-native-dialog qr-modal-backdrop"
      aria-labelledby="qr-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <Paper
        className="qr-modal panel"
        sx={(theme) => ({
          width: 'min(420px, calc(100vw - 32px))',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRadius: '28px',
          bgcolor: theme.palette.m3.surfaceContainerLow,
          color: theme.palette.m3.onSurface,
          p: { xs: 2.5, sm: 3 },
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 2,
          boxSizing: 'border-box',
        })}
      >
        <Box
          className="qr-modal-header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Typography
            id="qr-title"
            component="h2"
            variant="h6"
            sx={{ fontSize: '1.25rem', fontWeight: 500, m: 0 }}
          >
            {t('inbox.qrTitle')}
          </Typography>
          <IconButton
            className="qr-close-button"
            type="button"
            aria-label={t('toast.dismiss')}
            onClick={onClose}
            sx={(theme) => ({
              minWidth: 44,
              minHeight: 44,
              color: theme.palette.m3.onSurfaceVariant,
              '&:hover': {
                bgcolor: theme.palette.m3.surfaceContainerHigh,
              },
            })}
          >
            <AppIcon name="x" />
          </IconButton>
        </Box>

        <Typography
          className="qr-help"
          variant="body2"
          sx={(theme) => ({
            color: theme.palette.m3.onSurfaceVariant,
            m: 0,
          })}
        >
          {t('inbox.qrHelp')}
        </Typography>

        {!matrix ? (
          <Typography
            className="reader-error"
            role="alert"
            variant="body2"
            sx={(theme) => ({
              color: theme.palette.error.main,
              m: 0,
            })}
          >
            {t('inbox.qrError')}
          </Typography>
        ) : (
          <Box
            className="qr-code-wrapper"
            sx={(theme) => ({
              display: 'grid',
              placeItems: 'center',
              p: 2,
              borderRadius: '20px',
              bgcolor: '#ffffff',
              border: `1px solid ${theme.palette.m3.outlineVariant}`,
            })}
          >
            <svg
              className="qr-svg"
              viewBox={`0 0 ${matrixSize} ${matrixSize}`}
              shapeRendering="crispEdges"
              aria-hidden="true"
              style={{ width: 'min(220px, 100%)', height: 'auto', display: 'block' }}
            >
              <rect width="100%" height="100%" fill="white" />
              {matrix.map((row, r) =>
                row.map((cell, c) =>
                  cell ? (
                    <rect
                      key={`${r}-${c}`}
                      x={c + QUIET_ZONE}
                      y={r + QUIET_ZONE}
                      width="1"
                      height="1"
                      fill="black"
                    />
                  ) : null,
                ),
              )}
            </svg>
          </Box>
        )}

        <Box
          className="qr-address-card"
          sx={(theme) => ({
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            p: 1.5,
            borderRadius: '16px',
            bgcolor: theme.palette.m3.surfaceContainerLowest,
            minWidth: 0,
          })}
        >
          <Box
            component="span"
            className="qr-address-text"
            sx={{
              fontFamily: MONO_FONT_FAMILY,
              fontSize: '0.875rem',
              fontWeight: 500,
              overflowWrap: 'anywhere',
              minWidth: 0,
              flex: '1 1 10rem',
            }}
          >
            {address}
          </Box>
          <Button
            className="primary-button compact-button"
            variant="contained"
            type="button"
            disabled={copying}
            onClick={() => void copy()}
            startIcon={<AppIcon name={copied ? 'check' : 'copy'} />}
            sx={{ minHeight: 44, minWidth: 44, flexShrink: 0 }}
          >
            {copied ? t('address.copied') : t('address.copy')}
          </Button>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? t('address.copiedNotice') : ''}
          </span>
        </Box>

        {copyError ? (
          <Typography
            className="reader-error"
            role="alert"
            variant="body2"
            sx={(theme) => ({
              color: theme.palette.error.main,
              m: 0,
            })}
          >
            {copyError}
          </Typography>
        ) : null}
      </Paper>
    </dialog>
  )
}

export default QrCodeModal
