import { type FormEvent, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api } from '../api'
import { AppIcon } from '../components/AppIcon'
import { useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { useToast } from '../toast'
import type { AdminSettings, MailServerSettings } from '../types'

export interface MailServerTabProps {
  mailServer: MailServerSettings
  csrf: string
  onUpdated?: (settings: AdminSettings) => void
  onBusyChange?: (busy: boolean) => void
}

const RETENTION_PRESETS = [7, 30, 90, 365] as const

export function MailServerTab({ mailServer, csrf, onUpdated, onBusyChange }: MailServerTabProps) {
  const [draft, setDraft] = useState<MailServerSettings>(() => ({ ...mailServer }))
  const [pending, setPending] = useState(false)
  const [testing, setTesting] = useState(false)
  const busyRef = useRef(false)
  const onBusyRef = useRef(onBusyChange)
  onBusyRef.current = onBusyChange

  const { t, formatNumber } = useI18n()
  const toast = useToast()

  const isBusy = pending || testing
  busyRef.current = isBusy

  useEffect(() => {
    onBusyRef.current?.(isBusy)
  }, [isBusy])

  useEffect(() => {
    if (!busyRef.current) {
      setDraft({ ...mailServer })
    }
  }, [mailServer])

  function valid(): boolean {
    try {
      const url = new URL(draft.jmapUrl.trim())
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        draft.catchallAddress.trim().includes('@') &&
        draft.retentionDays >= 1 &&
        draft.retentionDays <= 3650
      )
    } catch {
      return false
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!valid()) {
      toast.error(t('error.mailValid'))
      return
    }
    setPending(true)
    busyRef.current = true
    onBusyRef.current?.(true)
    const values: Partial<MailServerSettings> = {
      ...draft,
      jmapUrl: draft.jmapUrl.trim(),
      catchallAddress: draft.catchallAddress.trim(),
      mailAccountId: draft.mailAccountId.trim(),
    }
    if (values.jmapToken === '********') delete values.jmapToken
    try {
      const settings = await api.admin.updateSettings({ mailServer: values }, csrf)
      onUpdated?.(settings)
      toast.success(t('mail.saved'))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('error.mail'))
    } finally {
      setPending(false)
    }
  }

  async function testConnection(): Promise<void> {
    setTesting(true)
    busyRef.current = true
    onBusyRef.current?.(true)
    try {
      const result = await api.admin.testMail(csrf)
      toast.success(
        t('mail.passed', {
          domains: formatNumber(result.domainCount),
          messages: formatNumber(result.messages.stored),
        }),
      )
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('error.connection'))
    } finally {
      setTesting(false)
    }
  }

  return (
    <Box component="section" className="admin-section" aria-labelledby="mail-server-title" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="overline" className="eyebrow" color="text.secondary" sx={{ display: 'block', letterSpacing: '0.08em' }}>
          {t('mail.eyebrow')}
        </Typography>
        <Typography id="mail-server-title" component="h1" variant="h4" sx={{ fontSize: '2rem', fontWeight: 500, lineHeight: 1.2 }}>
          {t('admin.mail')}
        </Typography>
      </Box>

      <Box component="form" className="settings-form" onSubmit={save}>
        <Box
          component="fieldset"
          className="settings-fields"
          disabled={isBusy}
          sx={{ border: 0, p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}
        >
          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('mail.jmapConfig')}
            </Typography>
            <TextField
              id="jmap-url"
              name="jmapUrl"
              type="url"
              label={t('mail.url')}
              value={draft.jmapUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, jmapUrl: e.target.value }))}
              required
              disabled={isBusy}
              fullWidth
              slotProps={{ htmlInput: { className: 'font-mono', style: { fontFamily: MONO_FONT_FAMILY } } }}
            />
            <TextField
              id="jmap-token"
              name="jmapToken"
              type="password"
              label={t('mail.token')}
              value={draft.jmapToken}
              onChange={(e) => setDraft((prev) => ({ ...prev, jmapToken: e.target.value }))}
              helperText={t('mail.tokenHelp')}
              autoComplete="new-password"
              required
              disabled={isBusy}
              fullWidth
              slotProps={{ htmlInput: { className: 'font-mono', style: { fontFamily: MONO_FONT_FAMILY } } }}
            />
          </Card>

          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('mail.accountRetention')}
            </Typography>
            <Box
              className="settings-grid"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}
            >
              <TextField
                id="catchall-address"
                name="catchallAddress"
                type="email"
                label={t('mail.catchall')}
                value={draft.catchallAddress}
                onChange={(e) => setDraft((prev) => ({ ...prev, catchallAddress: e.target.value }))}
                required
                disabled={isBusy}
                fullWidth
              />
              <TextField
                id="mail-account-id"
                name="mailAccountId"
                label={t('mail.account')}
                value={draft.mailAccountId}
                onChange={(e) => setDraft((prev) => ({ ...prev, mailAccountId: e.target.value }))}
                helperText={t('mail.accountHelp')}
                disabled={isBusy}
                fullWidth
              />
              <Stack spacing={1} className="field" sx={{ gridColumn: { md: '1 / -1' } }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} className="retention-input-row" sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
                  <TextField
                    id="retention-days"
                    name="retentionDays"
                    type="number"
                    label={t('mail.retention')}
                    value={draft.retentionDays}
                    onChange={(e) => setDraft((prev) => ({ ...prev, retentionDays: Number(e.target.value) }))}
                    required
                    disabled={isBusy}
                    sx={{ maxWidth: { sm: 220 } }}
                    slotProps={{ htmlInput: { min: 1, max: 3650 } }}
                  />
                  <Stack direction="row" spacing={1} useFlexGap className="preset-chips" sx={{ flexWrap: 'wrap' }}>
                    {RETENTION_PRESETS.map((days) => {
                      const active = draft.retentionDays === days
                      return (
                        <Chip
                          key={days}
                          component="span"
                          role="button"
                          tabIndex={isBusy ? -1 : 0}
                          label={`${days}d`}
                          className={active ? 'chip-button active' : 'chip-button'}
                          onClick={() => {
                            if (!isBusy) setDraft((prev) => ({ ...prev, retentionDays: days }))
                          }}
                          onKeyDown={(e) => {
                            if (isBusy) return
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setDraft((prev) => ({ ...prev, retentionDays: days }))
                            }
                          }}
                          sx={(theme) => ({
                            cursor: isBusy ? 'default' : 'pointer',
                            bgcolor: active ? theme.palette.m3.secondaryContainer : theme.palette.m3.surfaceContainerHigh,
                            color: active ? theme.palette.m3.onSecondaryContainer : theme.palette.m3.onSurface,
                            border: `1px solid ${active ? 'transparent' : theme.palette.m3.outlineVariant}`,
                          })}
                        />
                      )
                    })}
                  </Stack>
                </Stack>
              </Stack>
            </Box>
          </Card>

          <Stack direction="row" spacing={1.5} className="form-actions" sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button
              className="secondary-button"
              type="button"
              variant="outlined"
              disabled={isBusy}
              onClick={() => { void testConnection() }}
              startIcon={<AppIcon name="activity" />}
            >
              {testing ? t('mail.testing') : t('mail.test')}
            </Button>
            <Button className="primary-button" type="submit" variant="contained" disabled={isBusy}>
              {pending ? t('reader.saving') : t('mail.save')}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}

export default MailServerTab
