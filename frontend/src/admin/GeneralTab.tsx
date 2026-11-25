import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api } from '../api'
import { useI18n } from '../i18n'
import { useToast } from '../toast'
import type { AdminSettings, AdminSiteSettings } from '../types'

export interface GeneralTabProps {
  site: AdminSiteSettings
  csrf: string
  onUpdated?: (settings: AdminSettings) => void
  onBusyChange?: (busy: boolean) => void
}

interface GeneralDraft {
  appName: string
  logoDataUrl: string
  faviconDataUrl: string
  primaryColor: string
  accentColor: string
  language: string
  cookieEnabled: boolean
  cookieText: string
}

function generalValues(site: AdminSiteSettings): GeneralDraft {
  return {
    appName: site.appName,
    logoDataUrl: site.logoDataUrl,
    faviconDataUrl: site.faviconDataUrl,
    primaryColor: site.primaryColor,
    accentColor: site.accentColor,
    language: site.language,
    cookieEnabled: site.cookieEnabled,
    cookieText: site.cookieText,
  }
}

export function GeneralTab({ site, csrf, onUpdated, onBusyChange }: GeneralTabProps) {
  const [draft, setDraft] = useState<GeneralDraft>(() => generalValues(site))
  const [pending, setPending] = useState(false)
  const [filePending, setFilePending] = useState(0)
  const fileVersions = useRef({ logoDataUrl: 0, faviconDataUrl: 0 })
  const busyRef = useRef(false)
  const onBusyRef = useRef(onBusyChange)
  onBusyRef.current = onBusyChange

  const { t } = useI18n()
  const toast = useToast()

  const isBusy = pending || filePending > 0
  busyRef.current = isBusy

  useEffect(() => {
    onBusyRef.current?.(isBusy)
  }, [isBusy])

  useEffect(() => {
    if (!busyRef.current) {
      setDraft(generalValues(site))
    }
  }, [site])

  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(t('error.image')))
      reader.onerror = () => reject(new Error(t('error.image')))
      reader.onabort = () => reject(new Error(t('error.image')))
      reader.readAsDataURL(file)
    })
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>, key: 'logoDataUrl' | 'faviconDataUrl'): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return
    const version = ++fileVersions.current[key]
    if (!file.type.startsWith('image/')) {
      toast.error(t('error.imageType'))
      return
    }
    if (file.size > 1024 * 1024) {
      toast.error(t('error.imageSize'))
      return
    }
    setFilePending((count) => count + 1)
    try {
      const value = await readFile(file)
      if (version === fileVersions.current[key]) {
        setDraft((prev) => ({ ...prev, [key]: value }))
      }
    } catch (cause) {
      if (version === fileVersions.current[key]) {
        toast.error(cause instanceof Error ? cause.message : t('error.image'))
      }
    } finally {
      setFilePending((count) => Math.max(0, count - 1))
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setPending(true)
    busyRef.current = true
    onBusyRef.current?.(true)
    try {
      const settings = await api.admin.updateSettings(
        {
          site: {
            ...draft,
            appName: draft.appName.trim(),
            language: draft.language.trim(),
          },
        },
        csrf,
      )
      onUpdated?.(settings)
      toast.success(t('general.saved'))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('error.general'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Box component="section" className="admin-section" aria-labelledby="general-title" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="overline" className="eyebrow" color="text.secondary" sx={{ display: 'block', letterSpacing: '0.08em' }}>
          {t('general.eyebrow')}
        </Typography>
        <Typography id="general-title" component="h1" variant="h4" sx={{ fontSize: '2rem', fontWeight: 500, lineHeight: 1.2 }}>
          {t('admin.general')}
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
              {t('admin.general')}
            </Typography>
            <Box
              className="settings-grid"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}
            >
              <TextField
                id="app-name"
                name="appName"
                label={t('general.appName')}
                value={draft.appName}
                onChange={(e) => setDraft((prev) => ({ ...prev, appName: e.target.value }))}
                required
                disabled={isBusy}
                fullWidth
              />
              <TextField
                id="language"
                name="language"
                label={t('general.language')}
                value={draft.language}
                onChange={(e) => setDraft((prev) => ({ ...prev, language: e.target.value }))}
                helperText={t('general.languageHelp')}
                required
                disabled={isBusy}
                fullWidth
              />
            </Box>
          </Card>

          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('general.brandingAssets')}
            </Typography>
            <Box
              className="settings-grid"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}
            >
              <Stack spacing={1} className="field image-upload-field">
                <Typography component="label" htmlFor="logo" variant="body2" sx={{ fontWeight: 500 }}>
                  {t('general.logo')}
                </Typography>
                <Stack direction="row" spacing={1.5} className="image-preview-container" sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  {draft.logoDataUrl ? (
                    <Box
                      component="img"
                      src={draft.logoDataUrl}
                      alt="Logo preview"
                      className="brand-preview-thumb"
                      sx={{ width: 48, height: 48, objectFit: 'contain', borderRadius: '12px', bgcolor: (theme) => theme.palette.m3.surfaceContainerLowest, p: 0.5 }}
                    />
                  ) : (
                    <Box
                      className="image-preview-placeholder"
                      sx={(theme) => ({
                        px: 1.5,
                        py: 1,
                        borderRadius: '12px',
                        bgcolor: theme.palette.m3.surfaceContainerHigh,
                        color: theme.palette.m3.onSurfaceVariant,
                        fontSize: '0.8125rem',
                      })}
                    >
                      No logo
                    </Box>
                  )}
                  <input
                    id="logo"
                    name="logo"
                    type="file"
                    accept="image/*"
                    className="file-input-custom"
                    disabled={isBusy}
                    onChange={(e) => { void chooseImage(e, 'logoDataUrl') }}
                  />
                </Stack>
                <Typography component="small" variant="caption" color="text.secondary">
                  {t('general.imageHelp')}
                </Typography>
              </Stack>

              <Stack spacing={1} className="field image-upload-field">
                <Typography component="label" htmlFor="favicon" variant="body2" sx={{ fontWeight: 500 }}>
                  {t('general.favicon')}
                </Typography>
                <Stack direction="row" spacing={1.5} className="image-preview-container" sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  {draft.faviconDataUrl ? (
                    <Box
                      component="img"
                      src={draft.faviconDataUrl}
                      alt="Favicon preview"
                      className="brand-preview-thumb favicon-thumb"
                      sx={{ width: 36, height: 36, objectFit: 'contain', borderRadius: '10px', bgcolor: (theme) => theme.palette.m3.surfaceContainerLowest, p: 0.5 }}
                    />
                  ) : (
                    <Box
                      className="image-preview-placeholder"
                      sx={(theme) => ({
                        px: 1.5,
                        py: 1,
                        borderRadius: '12px',
                        bgcolor: theme.palette.m3.surfaceContainerHigh,
                        color: theme.palette.m3.onSurfaceVariant,
                        fontSize: '0.8125rem',
                      })}
                    >
                      No favicon
                    </Box>
                  )}
                  <input
                    id="favicon"
                    name="favicon"
                    type="file"
                    accept="image/*"
                    className="file-input-custom"
                    disabled={isBusy}
                    onChange={(e) => { void chooseImage(e, 'faviconDataUrl') }}
                  />
                </Stack>
                <Typography component="small" variant="caption" color="text.secondary">
                  {t('general.imageHelp')}
                </Typography>
              </Stack>
            </Box>

            <Box
              className="settings-grid margin-top-md"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}
            >
              <Stack spacing={0.75} className="field color-picker-field">
                <Typography component="label" htmlFor="primary-color" variant="body2" sx={{ fontWeight: 500 }}>
                  {t('general.primary')}
                </Typography>
                <Stack direction="row" spacing={1.5} className="color-input-wrapper" sx={{ alignItems: 'center' }}>
                  <Box
                    component="span"
                    className="color-swatch-preview"
                    sx={(theme) => ({
                      width: 32,
                      height: 32,
                      borderRadius: '10px',
                      bgcolor: draft.primaryColor,
                      border: `1px solid ${theme.palette.m3.outlineVariant}`,
                      flexShrink: 0,
                    })}
                  />
                  <input
                    id="primary-color"
                    name="primaryColor"
                    type="color"
                    value={draft.primaryColor}
                    disabled={isBusy}
                    onChange={(e) => setDraft((prev) => ({ ...prev, primaryColor: e.target.value }))}
                  />
                </Stack>
                <Typography component="small" variant="caption" color="text.secondary">
                  {t('general.colorHelp')}
                </Typography>
              </Stack>

              <Stack spacing={0.75} className="field color-picker-field">
                <Typography component="label" htmlFor="accent-color" variant="body2" sx={{ fontWeight: 500 }}>
                  {t('general.accent')}
                </Typography>
                <Stack direction="row" spacing={1.5} className="color-input-wrapper" sx={{ alignItems: 'center' }}>
                  <Box
                    component="span"
                    className="color-swatch-preview"
                    sx={(theme) => ({
                      width: 32,
                      height: 32,
                      borderRadius: '10px',
                      bgcolor: draft.accentColor,
                      border: `1px solid ${theme.palette.m3.outlineVariant}`,
                      flexShrink: 0,
                    })}
                  />
                  <input
                    id="accent-color"
                    name="accentColor"
                    type="color"
                    value={draft.accentColor}
                    disabled={isBusy}
                    onChange={(e) => setDraft((prev) => ({ ...prev, accentColor: e.target.value }))}
                  />
                </Stack>
                <Typography component="small" variant="caption" color="text.secondary">
                  {t('general.colorHelp')}
                </Typography>
              </Stack>
            </Box>
          </Card>

          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('general.cookieConsent')}
            </Typography>
            <FormControlLabel
              className="check-field"
              control={
                <Checkbox
                  name="cookieEnabled"
                  checked={draft.cookieEnabled}
                  disabled={isBusy}
                  onChange={(e) => setDraft((prev) => ({ ...prev, cookieEnabled: e.target.checked }))}
                />
              }
              label={t('general.cookieEnabled')}
            />
            <TextField
              id="cookie-text"
              name="cookieText"
              label={t('general.cookieText')}
              value={draft.cookieText}
              onChange={(e) => setDraft((prev) => ({ ...prev, cookieText: e.target.value }))}
              multiline
              minRows={4}
              disabled={isBusy || !draft.cookieEnabled}
              fullWidth
            />
          </Card>

          <Stack direction="row" className="form-actions" sx={{ justifyContent: 'flex-end' }}>
            <Button className="primary-button" type="submit" variant="contained" disabled={isBusy}>
              {pending ? t('reader.saving') : t('general.save')}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}

export default GeneralTab
