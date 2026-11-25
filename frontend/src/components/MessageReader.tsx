import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { useI18n } from '../i18n'
import { authorizationFailed } from '../mailbox-access'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { useToast } from '../toast'
import type { AttachmentResource, MessageResource } from '../types'
import { extractVerificationCode } from '../verificationCode'
import { AppIcon } from './AppIcon'
import { SandboxFrame } from './SandboxFrame'

export interface MessageReaderProps {
  token: string
  messageId: string
  address?: string
  onBack?: () => void
  onDeleted?: (id: string) => void
  onUnauthorized?: () => void
  onSeen?: (id: string) => void
  onStale?: (id: string) => void
}

function formatAddress(value: { name: string; address: string }): string {
  return value.name ? `${value.name} <${value.address}>` : value.address
}

function safeFilename(value: string, fallback = 'attachment', maxLength = 120): string {
  const basename =
    value
      .normalize('NFKC')
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/[<>:"|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^[ .]+|[ .]+$/g, '') || ''
  if (!basename) return fallback
  if (basename.length <= maxLength) return basename

  const dot = basename.lastIndexOf('.')
  const extension =
    dot > 0 && /^\.[a-z0-9]{1,15}$/i.test(basename.slice(dot)) ? basename.slice(dot) : ''
  const stem =
    basename.slice(0, maxLength - extension.length).replace(/[ .]+$/g, '') || fallback
  return `${stem}${extension}`
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function MessageReader({
  token,
  messageId,
  onBack,
  onDeleted,
  onUnauthorized,
  onSeen,
  onStale,
}: MessageReaderProps) {
  const { t, formatDate: localDate, formatNumber } = useI18n()
  const toast = useToast()

  const [message, setMessage] = useState<MessageResource | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [bodyMode, setBodyMode] = useState<'html' | 'text'>('html')
  const [busy, setBusy] = useState('')

  const backButtonRef = useRef<HTMLButtonElement | null>(null)
  const requestVersionRef = useRef(0)
  const sessionVersionRef = useRef(0)
  const accessInvalidRef = useRef(false)
  const prevTokenRef = useRef<string | undefined>(undefined)
  const busyRef = useRef('')

  const callbacksRef = useRef({ onBack, onDeleted, onUnauthorized, onSeen, onStale, t, toast })
  callbacksRef.current = { onBack, onDeleted, onUnauthorized, onSeen, onStale, t, toast }

  const verificationCode = useMemo(() => {
    if (!message) return ''
    return extractVerificationCode(message.subject, message.text, message.html)
  }, [message])

  function formatDate(value: string): string {
    return localDate(value, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  function formatBytes(value: number): string {
    if (value < 1024) return `${formatNumber(value)} B`
    if (value < 1024 * 1024) return `${formatNumber(Math.round(value / 1024))} KB`
    return `${formatNumber(Number((value / (1024 * 1024)).toFixed(1)), { maximumFractionDigits: 1 })} MB`
  }

  function invalidateAccess(cause: unknown, session: number): boolean {
    if (session !== sessionVersionRef.current || !authorizationFailed(cause)) return false
    accessInvalidRef.current = true
    ++sessionVersionRef.current
    ++requestVersionRef.current
    setMessage(null)
    busyRef.current = ''
    setBusy('')
    setLoading(false)
    setError(callbacksRef.current.t('password.changed'))
    callbacksRef.current.onUnauthorized?.()
    return true
  }

  async function loadMessage(currentToken: string, currentId: string): Promise<void> {
    if (accessInvalidRef.current) return
    const version = ++requestVersionRef.current
    const session = sessionVersionRef.current
    setLoading(true)
    setError('')
    setActionError('')
    busyRef.current = ''
    setBusy('')
    setMessage(null)
    setBodyMode('html')
    try {
      const value = await api.message(currentToken, currentId)
      if (version !== requestVersionRef.current) return
      setMessage(value)
      if (!value.seen) {
        try {
          await api.setSeen(currentToken, currentId, true)
          if (version === requestVersionRef.current) {
            callbacksRef.current.onSeen?.(currentId)
          }
        } catch (cause) {
          if (invalidateAccess(cause, session)) return
          if (version === requestVersionRef.current) {
            setActionError(
              cause instanceof ApiError ? cause.message : callbacksRef.current.t('error.seen'),
            )
          }
        }
      }
    } catch (cause) {
      if (invalidateAccess(cause, session)) return
      if (version !== requestVersionRef.current) return
      if (cause instanceof ApiError && cause.status === 404) {
        setError(callbacksRef.current.t('error.stale'))
        callbacksRef.current.onStale?.(currentId)
      } else {
        setError(
          cause instanceof ApiError ? cause.message : callbacksRef.current.t('error.message'),
        )
      }
    } finally {
      if (version === requestVersionRef.current) setLoading(false)
    }
  }

  async function copyVerificationCode(): Promise<void> {
    if (!verificationCode) return
    setActionError('')
    try {
      await copyText(verificationCode)
      callbacksRef.current.toast.success(callbacksRef.current.t('inbox.codeCopied'))
    } catch {
      setActionError(callbacksRef.current.t('error.copy'))
    }
  }

  async function downloadAttachment(attachment: AttachmentResource): Promise<void> {
    if (!message) return
    const version = requestVersionRef.current
    const session = sessionVersionRef.current
    const currentToken = token
    const currentMessageId = message.id
    const attachmentId = attachment.id
    const filename = safeFilename(attachment.filename)
    const action = `attachment:${attachmentId}`
    busyRef.current = action
    setBusy(action)
    setActionError('')
    try {
      const blob = await api.attachment(currentToken, currentMessageId, attachmentId)
      if (version === requestVersionRef.current) saveBlob(blob, filename)
    } catch (cause) {
      if (invalidateAccess(cause, session)) return
      if (version === requestVersionRef.current) {
        setActionError(
          cause instanceof ApiError ? cause.message : callbacksRef.current.t('error.download'),
        )
      }
    } finally {
      if (version === requestVersionRef.current && busyRef.current === action) {
        busyRef.current = ''
        setBusy('')
      }
    }
  }

  async function downloadSource(): Promise<void> {
    if (!message) return
    const version = requestVersionRef.current
    const session = sessionVersionRef.current
    const currentToken = token
    const currentMessageId = message.id
    const filename = `${safeFilename(currentMessageId, 'message', 116)}.eml`
    const action = 'source'
    busyRef.current = action
    setBusy(action)
    setActionError('')
    try {
      const blob = await api.source(currentToken, currentMessageId)
      if (version === requestVersionRef.current) saveBlob(blob, filename)
    } catch (cause) {
      if (invalidateAccess(cause, session)) return
      if (version === requestVersionRef.current) {
        setActionError(
          cause instanceof ApiError ? cause.message : callbacksRef.current.t('error.source'),
        )
      }
    } finally {
      if (version === requestVersionRef.current && busyRef.current === action) {
        busyRef.current = ''
        setBusy('')
      }
    }
  }

  async function deleteCurrent(): Promise<void> {
    if (!message || !window.confirm(t('reader.deleteConfirm'))) return
    const version = requestVersionRef.current
    const session = sessionVersionRef.current
    const currentToken = token
    const currentMessageId = message.id
    const action = 'delete'
    busyRef.current = action
    setBusy(action)
    setActionError('')
    try {
      await api.deleteMessage(currentToken, currentMessageId)
      if (version === requestVersionRef.current) {
        callbacksRef.current.onDeleted?.(currentMessageId)
      }
    } catch (cause) {
      if (invalidateAccess(cause, session)) return
      if (version === requestVersionRef.current) {
        if (cause instanceof ApiError && cause.status === 404) {
          callbacksRef.current.onDeleted?.(currentMessageId)
        } else {
          setActionError(
            cause instanceof ApiError ? cause.message : callbacksRef.current.t('error.delete'),
          )
        }
      }
    } finally {
      if (version === requestVersionRef.current && busyRef.current === action) {
        busyRef.current = ''
        setBusy('')
      }
    }
  }

  useEffect(() => {
    if (prevTokenRef.current !== undefined && prevTokenRef.current !== token) {
      ++sessionVersionRef.current
      accessInvalidRef.current = false
    }
    prevTokenRef.current = token
    void loadMessage(token, messageId)
  }, [token, messageId])

  // Opening a message moves focus into the reader (onto the back button) so keyboard/AT users
  // land on the content they asked for; on narrow screens the list is hidden while it is open.
  useEffect(() => {
    backButtonRef.current?.focus()
    return () => {
      ++requestVersionRef.current
      ++sessionVersionRef.current
    }
  }, [])

  return (
    <Paper
      component="article"
      className="message-reader panel"
      aria-live="polite"
      sx={(theme) => ({
        borderRadius: '28px',
        bgcolor: theme.palette.m3.surfaceContainerLow,
        color: theme.palette.m3.onSurface,
        p: { xs: 2, sm: 3, md: 3.5 },
        minWidth: 0,
        display: 'grid',
        gap: 2,
      })}
    >
      <Button
        ref={backButtonRef}
        className="reader-back secondary-button"
        variant="outlined"
        type="button"
        data-action="close"
        startIcon={<AppIcon name="arrow-left" />}
        onClick={() => onBack?.()}
        sx={{ justifySelf: 'start' }}
      >
        {t('reader.back')}
      </Button>

      {loading ? (
        <Stack className="reader-loading" spacing={1.5}>
          <Skeleton variant="text" width="35%" height={22} />
          <Skeleton variant="text" width="70%" height={34} />
          <Skeleton variant="rounded" width="100%" height={220} sx={{ borderRadius: '16px' }} />
          <span className="sr-only">{t('reader.loading')}</span>
        </Stack>
      ) : error ? (
        <Box className="reader-state" sx={{ display: 'grid', gap: 1.5, justifyItems: 'start', py: 2 }}>
          <Typography component="h2" variant="h6" sx={{ m: 0 }}>
            {t('reader.unavailable')}
          </Typography>
          <Typography variant="body2" sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}>
            {error}
          </Typography>
          <Button
            className="secondary-button"
            variant="outlined"
            type="button"
            onClick={() => void loadMessage(token, messageId)}
          >
            {t('address.retry')}
          </Button>
        </Box>
      ) : message ? (
        <>
          <Box
            component="header"
            className="reader-header"
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 2,
              minWidth: 0,
            }}
          >
            <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, flex: '1 1 16rem' }}>
              <Typography
                className="reader-sender"
                variant="body2"
                sx={(theme) => ({
                  color: theme.palette.m3.onSurfaceVariant,
                  overflowWrap: 'anywhere',
                  m: 0,
                })}
              >
                {formatAddress(message.from)}
              </Typography>
              <Typography
                component="h2"
                variant="h5"
                sx={{
                  fontSize: 'clamp(1.25rem, 2vw, 1.5rem)',
                  fontWeight: 500,
                  overflowWrap: 'anywhere',
                  m: 0,
                }}
              >
                {message.subject || t('inbox.noSubject')}
              </Typography>
              <Box
                component="time"
                dateTime={message.createdAt}
                sx={(theme) => ({
                  color: theme.palette.m3.onSurfaceVariant,
                  fontSize: '0.8125rem',
                })}
              >
                {formatDate(message.createdAt)}
              </Box>
            </Box>

            <Box
              className="reader-actions"
              sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
            >
              <Button
                className="secondary-button compact-button"
                variant="outlined"
                type="button"
                data-download-source=""
                disabled={Boolean(busy)}
                startIcon={<AppIcon name="file-down" />}
                onClick={() => void downloadSource()}
              >
                {busy === 'source' ? t('reader.saving') : t('reader.downloadSource')}
              </Button>
              <Button
                className="danger-button compact-button"
                variant="contained"
                color="error"
                type="button"
                data-action="delete"
                disabled={Boolean(busy)}
                startIcon={<AppIcon name="trash-2" />}
                onClick={() => void deleteCurrent()}
              >
                {busy === 'delete' ? t('reader.deleting') : t('reader.delete')}
              </Button>
            </Box>
          </Box>

          <Box
            component="dl"
            className="message-meta"
            sx={(theme) => ({
              display: 'grid',
              gap: 0.5,
              m: 0,
              p: 1.5,
              borderRadius: '16px',
              bgcolor: theme.palette.m3.surfaceContainer,
              fontSize: '0.8125rem',
              '& > div': {
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1,
                minWidth: 0,
              },
              '& dt': {
                color: theme.palette.m3.onSurfaceVariant,
                fontWeight: 600,
                minWidth: '2.5rem',
              },
              '& dd': {
                m: 0,
                fontFamily: MONO_FONT_FAMILY,
                overflowWrap: 'anywhere',
                minWidth: 0,
                flex: 1,
              },
            })}
          >
            <div>
              <dt>{t('reader.to')}</dt>
              <dd>{message.to.map(formatAddress).join(', ') || t('reader.undisclosed')}</dd>
            </div>
            {message.cc.length > 0 ? (
              <div>
                <dt>{t('reader.cc')}</dt>
                <dd>{message.cc.map(formatAddress).join(', ')}</dd>
              </div>
            ) : null}
            {message.bcc.length > 0 ? (
              <div>
                <dt>{t('reader.bcc')}</dt>
                <dd>{message.bcc.map(formatAddress).join(', ')}</dd>
              </div>
            ) : null}
          </Box>

          {actionError ? (
            <Typography
              className="reader-error"
              role="alert"
              variant="body2"
              sx={(theme) => ({ color: theme.palette.error.main, m: 0 })}
            >
              {actionError}
            </Typography>
          ) : null}

          <Box className="reader-content-grid" sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
            {verificationCode ? (
              <Box
                component="aside"
                className="verification-code"
                aria-label={t('reader.code')}
                sx={(theme) => ({
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  px: { xs: 2, sm: 2.5 },
                  py: 1.5,
                  borderRadius: '20px',
                  bgcolor: theme.palette.m3.tertiaryContainer,
                  color: theme.palette.m3.onTertiaryContainer,
                  minWidth: 0,
                })}
              >
                <Box className="verification-code-lead" sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
                  <Box
                    component="span"
                    className="verification-code-badge"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                    }}
                  >
                    <AppIcon name="badge-check" />
                    {t('reader.code')}
                  </Box>
                  <Box
                    component="code"
                    sx={{
                      fontFamily: MONO_FONT_FAMILY,
                      fontSize: { xs: '1.375rem', sm: '1.625rem' },
                      fontWeight: 500,
                      letterSpacing: '0.12em',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {verificationCode}
                  </Box>
                </Box>
                <Button
                  className="primary-button compact-button"
                  variant="contained"
                  type="button"
                  aria-label={t('inbox.copyCodeAction')}
                  startIcon={<AppIcon name="copy" />}
                  onClick={() => void copyVerificationCode()}
                  sx={(theme) => ({
                    bgcolor: theme.palette.m3.tertiary,
                    color: theme.palette.m3.onTertiary,
                    '&:hover': {
                      bgcolor: theme.palette.m3.tertiary,
                      opacity: 0.92,
                    },
                  })}
                >
                  {t('address.copy')}
                </Button>
              </Box>
            ) : null}

            <Box className="reader-body" sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
              {message.html.length > 0 && message.text ? (
                <Box
                  className="body-switcher"
                  role="group"
                  aria-label={t('reader.format')}
                  sx={(theme) => ({
                    display: 'inline-flex',
                    justifySelf: 'start',
                    p: 0.5,
                    borderRadius: '9999px',
                    bgcolor: theme.palette.m3.surfaceContainerHigh,
                    gap: 0.5,
                  })}
                >
                  <Button
                    type="button"
                    size="small"
                    aria-pressed={bodyMode === 'html'}
                    onClick={() => setBodyMode('html')}
                    sx={(theme) => ({
                      minHeight: 36,
                      px: 2,
                      bgcolor: bodyMode === 'html' ? theme.palette.m3.secondaryContainer : 'transparent',
                      color:
                        bodyMode === 'html'
                          ? theme.palette.m3.onSecondaryContainer
                          : theme.palette.m3.onSurfaceVariant,
                    })}
                  >
                    {t('reader.html')}
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    aria-pressed={bodyMode === 'text'}
                    onClick={() => setBodyMode('text')}
                    sx={(theme) => ({
                      minHeight: 36,
                      px: 2,
                      bgcolor: bodyMode === 'text' ? theme.palette.m3.secondaryContainer : 'transparent',
                      color:
                        bodyMode === 'text'
                          ? theme.palette.m3.onSecondaryContainer
                          : theme.palette.m3.onSurfaceVariant,
                    })}
                  >
                    {t('reader.text')}
                  </Button>
                </Box>
              ) : null}

              {message.html.length > 0 && bodyMode === 'html' ? (
                <SandboxFrame
                  html={message.html.join('\n')}
                  mode="message"
                  title={t('reader.title', { subject: message.subject || t('inbox.noSubject') })}
                />
              ) : (
                <Box
                  component="pre"
                  className="plain-message"
                  sx={(theme) => ({
                    minHeight: '18rem',
                    m: 0,
                    p: 2,
                    borderRadius: '16px',
                    border: `1px solid ${theme.palette.m3.outlineVariant}`,
                    bgcolor: theme.palette.m3.surfaceContainerLowest,
                    color: theme.palette.m3.onSurface,
                    fontFamily: MONO_FONT_FAMILY,
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    overflowX: 'auto',
                  })}
                >
                  {message.text || t('reader.empty')}
                </Box>
              )}
            </Box>
          </Box>

          {message.attachments.length > 0 ? (
            <Box
              component="section"
              className="attachments"
              aria-labelledby="attachments-title"
              sx={{ display: 'grid', gap: 1, minWidth: 0 }}
            >
              <Typography
                id="attachments-title"
                component="h3"
                variant="subtitle2"
                sx={{ fontWeight: 600, m: 0 }}
              >
                {t('reader.attachments')}
              </Typography>
              <Box
                component="ul"
                sx={{
                  listStyle: 'none',
                  p: 0,
                  m: 0,
                  display: 'grid',
                  gap: 1,
                }}
              >
                {message.attachments.map((attachment) => {
                  const cleanName = safeFilename(attachment.filename)
                  return (
                    <Box
                      component="li"
                      key={attachment.id}
                      sx={(theme) => ({
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                        px: 2,
                        py: 1.25,
                        borderRadius: '16px',
                        bgcolor: theme.palette.m3.surfaceContainer,
                        minWidth: 0,
                      })}
                    >
                      <Box
                        component="span"
                        sx={{ display: 'grid', gap: 0.25, minWidth: 0, flex: '1 1 12rem' }}
                      >
                        <Box
                          component="strong"
                          sx={{ fontSize: '0.875rem', overflowWrap: 'anywhere' }}
                        >
                          {cleanName}
                        </Box>
                        <Box
                          component="small"
                          sx={(theme) => ({
                            color: theme.palette.m3.onSurfaceVariant,
                            fontSize: '0.75rem',
                          })}
                        >
                          {formatBytes(attachment.size)} · {attachment.contentType}
                        </Box>
                      </Box>
                      <Button
                        className="text-button"
                        variant="text"
                        type="button"
                        data-download-attachment=""
                        disabled={Boolean(busy)}
                        aria-label={t('reader.downloadFile', { filename: cleanName })}
                        startIcon={<AppIcon name="download" />}
                        onClick={() => void downloadAttachment(attachment)}
                      >
                        {busy === `attachment:${attachment.id}`
                          ? t('reader.saving')
                          : t('reader.download')}
                      </Button>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          ) : null}
        </>
      ) : null}
    </Paper>
  )
}

export default MessageReader
