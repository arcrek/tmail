import { type FormEvent, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import OutlinedInput from '@mui/material/OutlinedInput'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { ApiError, api } from '../api'
import { useI18n } from '../i18n'
import { authorizationFailed, mailboxSession, validPassword } from '../mailbox-access'
import { MONO_FONT_FAMILY } from '../muiTheme'
import type { AddressSession } from '../types'

export interface MailboxPasswordDialogProps {
  session: AddressSession
  onClose: () => void
  onUpdated: (session: AddressSession) => void
  onInvalid: () => void
  onReplacing: () => void
}

export function MailboxPasswordDialog({
  session,
  onClose,
  onUpdated,
  onInvalid,
  onReplacing,
}: MailboxPasswordDialogProps) {
  const { t, formatDate } = useI18n()
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
  )
  const activeRef = useRef(true)
  const pendingRef = useRef(false)
  const callbacksRef = useRef({ onClose, onUpdated, onInvalid, onReplacing })
  callbacksRef.current = { onClose, onUpdated, onInvalid, onReplacing }

  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [removing, setRemoving] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pendingRef.current) return
    setError('')
    const admin = session.accessKind === 'admin'
    if (
      (!removing && !validPassword(password)) ||
      (!admin && session.protected && !validPassword(currentPassword))
    ) {
      setError(t('password.length'))
      return
    }
    if (!removing && password !== confirmation) {
      setError(t('password.mismatch'))
      return
    }

    pendingRef.current = true
    setPending(true)
    try {
      let replacement: AddressSession
      if (admin) {
        if (!session.csrf) throw new ApiError(401, 'Administrator session expired')
        if (removing) await api.admin.removeMailboxPassword(session.address, session.csrf)
        else await api.admin.setMailboxPassword(session.address, password, session.csrf)
        if (activeRef.current) callbacksRef.current.onReplacing()
        const response = await api.admin.mailboxToken(session.address, session.csrf)
        replacement = {
          ...mailboxSession(session.address, response),
          accessKind: 'admin',
          csrf: session.csrf,
        }
      } else {
        const response = removing
          ? await api.removePassword(session.token, currentPassword)
          : await api.setPassword(
              session.token,
              password,
              session.protected ? currentPassword : undefined,
            )
        replacement = mailboxSession(session.address, response)
      }
      if (activeRef.current) callbacksRef.current.onUpdated(replacement)
    } catch (cause) {
      if (!activeRef.current) return
      // A wrong current password must leave the visitor's existing session usable.
      const apiError = cause instanceof ApiError ? cause : undefined
      const unauthorized = authorizationFailed(cause)
      const invalidToken = apiError?.detail?.code === 'invalid_token'
      if (invalidToken) setError(t('password.changed'))
      else if (unauthorized && !admin) setError(t('password.invalid'))
      else setError(apiError?.message ?? t('error.unavailable'))
      if (invalidToken || (admin && unauthorized) || apiError?.status === 409) {
        callbacksRef.current.onInvalid()
      }
    } finally {
      setCurrentPassword('')
      setPassword('')
      setConfirmation('')
      pendingRef.current = false
      setPending(false)
    }
  }

  useEffect(() => {
    activeRef.current = true
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (event: Event) => {
      event.preventDefault()
      if (!pendingRef.current) callbacksRef.current.onClose()
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
      activeRef.current = false
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
      triggerRef.current?.focus()
    }
  }, [])

  const submitLabel = pending
    ? t('password.busy')
    : removing
      ? t('password.remove')
      : !session.protected
        ? t('password.set')
        : session.accessKind === 'admin'
          ? t('password.reset')
          : t('password.change')

  return (
    <dialog
      ref={dialogRef}
      className="tmail-native-dialog qr-modal-backdrop"
      aria-labelledby="mailbox-password-title"
      onClick={(event) => {
        if (event.target === dialogRef.current && !pendingRef.current) {
          onClose()
        }
      }}
    >
      <Paper
        className="panel mailbox-password-dialog"
        sx={(theme) => ({
          width: 'min(440px, calc(100vw - 32px))',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRadius: '28px',
          bgcolor: theme.palette.m3.surfaceContainerLow,
          color: theme.palette.m3.onSurface,
          p: { xs: 2.5, sm: 3 },
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 1.5,
          boxSizing: 'border-box',
        })}
      >
        <Typography
          id="mailbox-password-title"
          component="h2"
          variant="h5"
          sx={{ fontSize: '1.375rem', fontWeight: 500, m: 0 }}
        >
          {t('password.title')}
        </Typography>

        <Typography
          className="mailbox-address"
          variant="body2"
          sx={{
            fontFamily: MONO_FONT_FAMILY,
            fontWeight: 500,
            overflowWrap: 'anywhere',
            m: 0,
          }}
        >
          {session.address}
        </Typography>

        {session.protectedUntil ? (
          <Typography
            variant="body2"
            sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
          >
            {t('password.deadline', {
              date: formatDate(session.protectedUntil, {
                dateStyle: 'long',
                timeStyle: 'short',
              }),
            })}
          </Typography>
        ) : null}

        <Typography
          variant="body2"
          sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
        >
          {t('password.warning')}
        </Typography>

        <Box
          component="form"
          className="settings-form"
          onSubmit={(event) => void submit(event)}
          sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}
        >
          <input type="hidden" name="username" autoComplete="username" value={session.address} />

          {session.protected && session.accessKind !== 'admin' ? (
            <Box className="field" sx={{ display: 'grid', gap: 0.75, minWidth: 0 }}>
              <Box
                component="label"
                htmlFor="mailbox-current-password"
                sx={{ fontSize: '0.875rem', fontWeight: 500 }}
              >
                {t('password.current')}
              </Box>
              <OutlinedInput
                id="mailbox-current-password"
                type="password"
                name="current-password"
                autoComplete="current-password"
                required
                fullWidth
                size="small"
                disabled={pending}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                error={Boolean(error)}
                inputProps={{
                  'aria-invalid': Boolean(error),
                  'aria-describedby': 'mailbox-password-error',
                }}
              />
            </Box>
          ) : null}

          {!removing ? (
            <>
              <Box className="field" sx={{ display: 'grid', gap: 0.75, minWidth: 0 }}>
                <Box
                  component="label"
                  htmlFor="mailbox-new-password"
                  sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                >
                  {t('password.new')}
                </Box>
                <OutlinedInput
                  id="mailbox-new-password"
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  required
                  fullWidth
                  size="small"
                  disabled={pending}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={Boolean(error)}
                  inputProps={{
                    'aria-describedby': 'mailbox-password-help mailbox-password-error',
                    'aria-invalid': Boolean(error),
                  }}
                />
              </Box>

              <Box className="field" sx={{ display: 'grid', gap: 0.75, minWidth: 0 }}>
                <Box
                  component="label"
                  htmlFor="mailbox-confirm-password"
                  sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                >
                  {t('password.confirm')}
                </Box>
                <OutlinedInput
                  id="mailbox-confirm-password"
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  required
                  fullWidth
                  size="small"
                  disabled={pending}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </Box>

              <Typography
                id="mailbox-password-help"
                variant="caption"
                sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
              >
                {t('password.length')}
              </Typography>
            </>
          ) : (
            <Typography
              role="note"
              variant="body2"
              sx={(theme) => ({ color: theme.palette.m3.onSurfaceVariant, m: 0 })}
            >
              {t('password.removeWarning')}
            </Typography>
          )}

          <Typography
            id="mailbox-password-error"
            className="reader-error"
            role="alert"
            variant="body2"
            sx={(theme) => ({
              color: theme.palette.error.main,
              m: 0,
              '&:empty': {
                display: 'block',
                height: 0,
                overflow: 'hidden',
              },
            })}
          >
            {error}
          </Typography>

          <Box
            className="mailbox-password-actions"
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              pt: 0.5,
            }}
          >
            <Button
              className="primary-button"
              variant="contained"
              type="submit"
              disabled={pending}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              {submitLabel}
            </Button>

            {session.protected ? (
              <Button
                className="secondary-button"
                variant="outlined"
                type="button"
                disabled={pending}
                onClick={() => {
                  setRemoving((prev) => !prev)
                  setError('')
                }}
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                {removing ? t('password.change') : t('password.remove')}
              </Button>
            ) : null}

            <Button
              className="text-button"
              variant="text"
              type="button"
              disabled={pending}
              onClick={onClose}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              {t('password.cancel')}
            </Button>
          </Box>
        </Box>
      </Paper>
    </dialog>
  )
}

export default MailboxPasswordDialog
