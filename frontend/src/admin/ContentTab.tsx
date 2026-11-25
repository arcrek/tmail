import { type FormEvent, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api } from '../api'
import { AppIcon } from '../components/AppIcon'
import { SandboxFrame } from '../components/SandboxFrame'
import { useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { useToast } from '../toast'
import type { AdminSettings, AdminSiteSettings } from '../types'

export interface ContentTabProps {
  site: AdminSiteSettings
  csrf: string
  onUpdated?: (settings: AdminSettings) => void
  onBusyChange?: (busy: boolean) => void
}

interface AdRow {
  name: string
  html: string
}

interface ContentDraft {
  headerHtml: string
  footerHtml: string
  contentCss: string
  ads: AdRow[]
}

const MAX_CONTENT_LENGTH = 100_000

function adRows(value: Record<string, unknown>): AdRow[] {
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([name, html]) => ({ name, html }))
}

function toDraft(site: AdminSiteSettings): ContentDraft {
  return {
    headerHtml: site.headerHtml,
    footerHtml: site.footerHtml,
    contentCss: site.contentCss,
    ads: adRows(site.adSlots),
  }
}

export function ContentTab({ site, csrf, onUpdated, onBusyChange }: ContentTabProps) {
  const [draft, setDraft] = useState<ContentDraft>(() => toDraft(site))
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const onBusyRef = useRef(onBusyChange)
  onBusyRef.current = onBusyChange

  const { t } = useI18n()
  const toast = useToast()

  pendingRef.current = pending

  useEffect(() => {
    onBusyRef.current?.(pending)
  }, [pending])

  useEffect(() => {
    if (!pendingRef.current) {
      setDraft(toDraft(site))
    }
  }, [site])

  function addSlot(): void {
    setDraft((prev) => ({ ...prev, ads: [...prev.ads, { name: '', html: '' }] }))
  }

  function removeSlot(index: number): void {
    setDraft((prev) => ({ ...prev, ads: prev.ads.filter((_, i) => i !== index) }))
  }

  function updateSlot(index: number, patch: Partial<AdRow>): void {
    setDraft((prev) => ({
      ...prev,
      ads: prev.ads.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    }))
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const names = draft.ads.map((slot) => slot.name.trim())
    if (names.some((name) => !name)) {
      toast.error(t('content.everyName'))
      return
    }
    if (new Set(names).size !== names.length) {
      toast.error(t('content.unique'))
      return
    }
    if (
      [draft.headerHtml, draft.footerHtml, draft.contentCss, ...draft.ads.map((slot) => slot.html)].some(
        (value) => value.length > MAX_CONTENT_LENGTH,
      )
    ) {
      toast.error(t('content.limit'))
      return
    }
    setPending(true)
    pendingRef.current = true
    onBusyRef.current?.(true)
    try {
      const settings = await api.admin.updateSettings(
        {
          site: {
            headerHtml: draft.headerHtml,
            footerHtml: draft.footerHtml,
            contentCss: draft.contentCss,
            adSlots: Object.fromEntries(draft.ads.map((slot, index) => [names[index]!, slot.html])),
          },
        },
        csrf,
      )
      onUpdated?.(settings)
      toast.success(t('content.saved'))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('error.content'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Box component="section" className="admin-section" aria-labelledby="content-title" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="overline" className="eyebrow" color="text.secondary" sx={{ display: 'block', letterSpacing: '0.08em' }}>
          {t('content.eyebrow')}
        </Typography>
        <Typography id="content-title" component="h1" variant="h4" sx={{ fontSize: '2rem', fontWeight: 500, lineHeight: 1.2 }}>
          {t('admin.content')}
        </Typography>
        <Typography variant="body2" color="text.secondary" className="admin-note" sx={{ mt: 0.5 }}>
          {t('content.note')}
        </Typography>
      </Box>

      <Box component="form" className="settings-form" onSubmit={save}>
        <Box
          component="fieldset"
          className="settings-fields"
          disabled={pending}
          sx={{ border: 0, p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}
        >
          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('content.headerTitle')}
            </Typography>
            <Box
              className="content-editor-grid"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}
            >
              <Stack spacing={0.75} className="field">
                <Stack direction="row" className="label-row-with-counter" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography component="label" htmlFor="header-html" variant="body2" sx={{ fontWeight: 500 }}>
                    {t('content.header')}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    className={draft.headerHtml.length > MAX_CONTENT_LENGTH * 0.9 ? 'char-counter font-mono counter-warn' : 'char-counter font-mono'}
                    sx={(theme) => ({
                      fontFamily: MONO_FONT_FAMILY,
                      color: draft.headerHtml.length > MAX_CONTENT_LENGTH * 0.9 ? theme.palette.error.main : 'text.secondary',
                    })}
                  >
                    {draft.headerHtml.length} / {MAX_CONTENT_LENGTH}
                  </Typography>
                </Stack>
                <TextField
                  id="header-html"
                  name="headerHtml"
                  value={draft.headerHtml}
                  onChange={(e) => setDraft((prev) => ({ ...prev, headerHtml: e.target.value }))}
                  multiline
                  minRows={10}
                  disabled={pending}
                  fullWidth
                  slotProps={{ htmlInput: { className: 'font-mono code-textarea', style: { fontFamily: MONO_FONT_FAMILY, fontSize: '0.85rem' } } }}
                />
              </Stack>
              <Stack spacing={0.75} className="preview-field">
                <Typography component="span" variant="body2" color="text.secondary" className="preview-label">
                  {t('content.headerPreview')}
                </Typography>
                <SandboxFrame html={draft.headerHtml} css={draft.contentCss} mode="content" title={t('content.headerPreview')} />
              </Stack>
            </Box>
          </Card>

          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('content.footerTitle')}
            </Typography>
            <Box
              className="content-editor-grid"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}
            >
              <Stack spacing={0.75} className="field">
                <Stack direction="row" className="label-row-with-counter" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography component="label" htmlFor="footer-html" variant="body2" sx={{ fontWeight: 500 }}>
                    {t('content.footer')}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    className={draft.footerHtml.length > MAX_CONTENT_LENGTH * 0.9 ? 'char-counter font-mono counter-warn' : 'char-counter font-mono'}
                    sx={(theme) => ({
                      fontFamily: MONO_FONT_FAMILY,
                      color: draft.footerHtml.length > MAX_CONTENT_LENGTH * 0.9 ? theme.palette.error.main : 'text.secondary',
                    })}
                  >
                    {draft.footerHtml.length} / {MAX_CONTENT_LENGTH}
                  </Typography>
                </Stack>
                <TextField
                  id="footer-html"
                  name="footerHtml"
                  value={draft.footerHtml}
                  onChange={(e) => setDraft((prev) => ({ ...prev, footerHtml: e.target.value }))}
                  multiline
                  minRows={10}
                  disabled={pending}
                  fullWidth
                  slotProps={{ htmlInput: { className: 'font-mono code-textarea', style: { fontFamily: MONO_FONT_FAMILY, fontSize: '0.85rem' } } }}
                />
              </Stack>
              <Stack spacing={0.75} className="preview-field">
                <Typography component="span" variant="body2" color="text.secondary" className="preview-label">
                  {t('content.footerPreview')}
                </Typography>
                <SandboxFrame html={draft.footerHtml} css={draft.contentCss} mode="content" title={t('content.footerPreview')} />
              </Stack>
            </Box>
          </Card>

          <Card className="settings-card panel" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography component="h2" variant="h6" className="card-title">
              {t('content.cssTitle')}
            </Typography>
            <Stack spacing={0.75} className="field">
              <Stack direction="row" className="label-row-with-counter" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography component="label" htmlFor="content-css" variant="body2" sx={{ fontWeight: 500 }}>
                  {t('content.css')}
                </Typography>
                <Typography
                  component="span"
                  variant="caption"
                  className={draft.contentCss.length > MAX_CONTENT_LENGTH * 0.9 ? 'char-counter font-mono counter-warn' : 'char-counter font-mono'}
                  sx={(theme) => ({
                    fontFamily: MONO_FONT_FAMILY,
                    color: draft.contentCss.length > MAX_CONTENT_LENGTH * 0.9 ? theme.palette.error.main : 'text.secondary',
                  })}
                >
                  {draft.contentCss.length} / {MAX_CONTENT_LENGTH}
                </Typography>
              </Stack>
              <TextField
                id="content-css"
                name="contentCss"
                value={draft.contentCss}
                onChange={(e) => setDraft((prev) => ({ ...prev, contentCss: e.target.value }))}
                multiline
                minRows={10}
                disabled={pending}
                fullWidth
                slotProps={{ htmlInput: { className: 'font-mono code-textarea', style: { fontFamily: MONO_FONT_FAMILY, fontSize: '0.85rem' } } }}
              />
            </Stack>
          </Card>

          <Card component="section" className="ad-settings settings-card panel" aria-labelledby="ad-slots-title" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Stack direction="row" className="subsection-heading" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Typography id="ad-slots-title" component="h2" variant="h6" className="card-title">
                {t('content.slots')}
              </Typography>
              <Button
                className="secondary-button compact-button"
                type="button"
                variant="outlined"
                size="small"
                disabled={pending}
                onClick={addSlot}
                startIcon={<AppIcon name="plus" />}
              >
                {t('content.add')}
              </Button>
            </Stack>

            {draft.ads.map((slot, index) => (
              <Box
                key={index}
                className="content-editor-grid ad-editor slot-card"
                sx={(theme) => ({
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
                  gap: 2,
                  p: 2,
                  borderRadius: '20px',
                  bgcolor: theme.palette.m3.surfaceContainerLowest,
                  border: `1px solid ${theme.palette.m3.outlineVariant}`,
                })}
              >
                <Stack spacing={1.25} className="field">
                  <TextField
                    id={`ad-name-${index}`}
                    label={t('content.name')}
                    value={slot.name}
                    onChange={(e) => updateSlot(index, { name: e.target.value })}
                    required
                    disabled={pending}
                    fullWidth
                    slotProps={{ htmlInput: { className: 'font-mono', style: { fontFamily: MONO_FONT_FAMILY } } }}
                  />
                  <Stack direction="row" className="label-row-with-counter margin-top-sm" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography component="label" htmlFor={`ad-html-${index}`} variant="body2" sx={{ fontWeight: 500 }}>
                      {t('content.ad')}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary" className="char-counter font-mono" sx={{ fontFamily: MONO_FONT_FAMILY }}>
                      {slot.html.length} / {MAX_CONTENT_LENGTH}
                    </Typography>
                  </Stack>
                  <TextField
                    id={`ad-html-${index}`}
                    value={slot.html}
                    onChange={(e) => updateSlot(index, { html: e.target.value })}
                    multiline
                    minRows={9}
                    disabled={pending}
                    fullWidth
                    slotProps={{ htmlInput: { className: 'font-mono code-textarea', style: { fontFamily: MONO_FONT_FAMILY, fontSize: '0.85rem' } } }}
                  />
                  <Box>
                    <Button
                      className="text-button danger-text margin-top-xs"
                      type="button"
                      variant="text"
                      color="error"
                      size="small"
                      disabled={pending}
                      onClick={() => removeSlot(index)}
                      startIcon={<AppIcon name="trash-2" />}
                    >
                      {t('content.remove')}
                    </Button>
                  </Box>
                </Stack>

                <Stack spacing={0.75} className="preview-field">
                  <Typography component="span" variant="body2" color="text.secondary" className="preview-label">
                    {t('content.preview', { name: slot.name || t('content.ad') })}
                  </Typography>
                  <SandboxFrame
                    html={slot.html}
                    css={draft.contentCss}
                    mode="content"
                    title={t('content.preview', { name: slot.name || t('content.ad') })}
                  />
                </Stack>
              </Box>
            ))}

            {draft.ads.length === 0 && (
              <Typography variant="body2" color="text.secondary" className="empty-copy">
                {t('content.none')}
              </Typography>
            )}
          </Card>

          <Stack direction="row" className="form-actions" sx={{ justifyContent: 'flex-end' }}>
            <Button className="primary-button" type="submit" variant="contained" disabled={pending}>
              {pending ? t('reader.saving') : t('content.save')}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}

export default ContentTab
