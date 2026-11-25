import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import type { GridColDef } from '@mui/x-data-grid'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { AppIcon } from '../components/AppIcon'
import { TMailDataGrid } from '../components/TMailDataGrid'
import { useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { toastActions } from '../toast'
import type { DeletedMessageResource, DeletedMessageSummary } from '../types'
import { extractVerificationCode } from '../verificationCode'
import { AdminSandboxFrame } from './ContentTab'

export interface DeletedMailTabProps {
  csrf: string
  onBusyChange?: (busy: boolean) => void
}

function formatAddress(value: { name: string; address: string }): string {
  return value.name ? `${value.name} <${value.address}>` : value.address
}

function safeFilename(value: string, fallback = 'message', maxLength = 116): string {
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
  return basename.slice(0, maxLength)
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

export function DeletedMailTab({ csrf, onBusyChange }: DeletedMailTabProps) {
  const { t, formatDate: localDate, formatNumber } = useI18n()
  const tRef = useRef(t)
  tRef.current = t

  const [items, setItems] = useState<DeletedMessageSummary[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DeletedMessageResource | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [actionError, setActionError] = useState('')
  const [bodyMode, setBodyMode] = useState<'html' | 'text'>('html')
  const [actionBusy, setActionBusy] = useState<'' | 'source' | 'delete'>('')

  const listHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const backButtonRef = useRef<HTMLButtonElement | null>(null)
  const listVersionRef = useRef(0)
  const detailVersionRef = useRef(0)
  const shouldFocusHeadingRef = useRef(false)
  const onBusyRef = useRef(onBusyChange)
  onBusyRef.current = onBusyChange

  const formatDate = useCallback(
    (value: string): string =>
      localDate(value, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [localDate],
  )

  const formatBytes = useCallback(
    (value: number): string => {
      if (value < 1024) return `${formatNumber(value)} B`
      if (value < 1024 * 1024) return `${formatNumber(Math.round(value / 1024))} KB`
      return `${formatNumber(Number((value / (1024 * 1024)).toFixed(1)), { maximumFractionDigits: 1 })} MB`
    },
    [formatNumber],
  )

  const verificationCode = useMemo(() => {
    if (!detail) return ''
    return extractVerificationCode(detail.subject, detail.text, detail.html)
  }, [detail])

  const loadList = useCallback(
    async (targetPage: number, targetQuery: string, targetLimit: number): Promise<void> => {
      const version = ++listVersionRef.current
      setLoading(true)
      setError('')
      try {
        const response = await api.admin.deletedMessages.list(targetPage, targetQuery, targetLimit)
        if (version !== listVersionRef.current) return
        setItems(response.member)
        setTotalItems(response.totalItems)
      } catch (cause) {
        if (version !== listVersionRef.current) return
        setError(cause instanceof ApiError ? cause.message : tRef.current('error.deletedLoad'))
      } finally {
        if (version === listVersionRef.current) setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadList(1, '', 20)
    return () => {
      listVersionRef.current += 1
      detailVersionRef.current += 1
    }
  }, [loadList])

  useEffect(() => {
    if (selectedId !== null) {
      backButtonRef.current?.focus()
    } else if (shouldFocusHeadingRef.current) {
      shouldFocusHeadingRef.current = false
      listHeadingRef.current?.focus()
    }
  }, [selectedId])

  async function submitSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const trimmed = searchInput.trim()
    setSelectedId(null)
    setPage(1)
    setActiveQuery(trimmed)
    await loadList(1, trimmed, limit)
  }

  async function clearSearch(): Promise<void> {
    setSearchInput('')
    setActiveQuery('')
    setPage(1)
    await loadList(1, '', limit)
  }

  const openDetail = useCallback(async (id: string): Promise<void> => {
    setSelectedId(id)
    const version = ++detailVersionRef.current
    setDetailLoading(true)
    setDetailError('')
    setActionError('')
    setActionBusy('')
    setDetail(null)
    setBodyMode('html')
    try {
      const loaded = await api.admin.deletedMessages.get(id)
      if (version !== detailVersionRef.current) return
      setDetail(loaded)
    } catch (cause) {
      if (version !== detailVersionRef.current) return
      setDetailError(cause instanceof ApiError ? cause.message : tRef.current('error.deletedMessage'))
    } finally {
      if (version === detailVersionRef.current) setDetailLoading(false)
    }
  }, [])

  function closeDetail(): void {
    detailVersionRef.current += 1
    shouldFocusHeadingRef.current = true
    setSelectedId(null)
    setDetail(null)
    setDetailError('')
    setActionError('')
    setActionBusy('')
  }

  async function copyVerificationCode(): Promise<void> {
    if (!verificationCode) return
    setActionError('')
    try {
      await copyText(verificationCode)
      toastActions.success(t('inbox.codeCopied'))
    } catch {
      setActionError(t('error.copy'))
    }
  }

  async function downloadSource(): Promise<void> {
    if (!detail || !detail.hasSource) return
    const version = detailVersionRef.current
    const id = detail.id
    setActionBusy('source')
    setActionError('')
    try {
      const blob = await api.admin.deletedMessages.source(id)
      if (version === detailVersionRef.current) saveBlob(blob, `${safeFilename(id)}.eml`)
    } catch (cause) {
      if (version === detailVersionRef.current) {
        setActionError(cause instanceof ApiError ? cause.message : t('error.source'))
      }
    } finally {
      if (version === detailVersionRef.current) {
        setActionBusy((prev) => (prev === 'source' ? '' : prev))
      }
    }
  }

  async function deletePermanently(): Promise<void> {
    if (!detail || !window.confirm(t('deleted.deleteConfirm'))) return
    const version = detailVersionRef.current
    const id = detail.id
    setActionBusy('delete')
    setActionError('')
    onBusyRef.current?.(true)
    try {
      await api.admin.deletedMessages.remove(id, csrf)
      if (version !== detailVersionRef.current) return
      toastActions.success(t('deleted.deletedNotice'))
      const nextPage = items.length === 1 && page > 1 ? page - 1 : page
      closeDetail()
      setPage(nextPage)
      await loadList(nextPage, activeQuery, limit)
    } catch (cause) {
      if (version === detailVersionRef.current) {
        setActionError(cause instanceof ApiError ? cause.message : t('error.deletedDelete'))
      }
    } finally {
      if (version === detailVersionRef.current) {
        setActionBusy((prev) => (prev === 'delete' ? '' : prev))
      }
      onBusyRef.current?.(false)
    }
  }

  const columns = useMemo<GridColDef<DeletedMessageSummary>[]>(
    () => [
      {
        field: 'mailboxAddress',
        headerName: t('deleted.mailbox'),
        flex: 1.1,
        minWidth: 190,
        cellClassName: 'tmail-mono-cell',
        renderCell: (params) => (
          <Button
            type="button"
            variant="text"
            size="small"
            className="message-row"
            data-deleted-id={params.row.id}
            onClick={(e) => {
              e.stopPropagation()
              void openDetail(params.row.id)
            }}
            sx={{
              fontFamily: MONO_FONT_FAMILY,
              fontSize: '0.84rem',
              justifyContent: 'flex-start',
              textAlign: 'left',
              px: 1,
              minWidth: 0,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {params.row.mailboxAddress}
          </Button>
        ),
      },
      {
        field: 'from',
        headerName: t('deleted.from'),
        flex: 0.9,
        minWidth: 150,
        valueGetter: (_value, row) => row.from.name || row.from.address,
      },
      {
        field: 'subject',
        headerName: t('bulkCode.subject'),
        flex: 1.5,
        minWidth: 220,
        renderCell: (params) => (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, width: '100%' }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                {params.row.subject || t('inbox.noSubject')}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {params.row.intro || t('inbox.noPreview')}
              </Typography>
            </Box>
            {params.row.hasAttachments && (
              <Box component="span" className="attachment-flag" sx={{ color: 'text.secondary', display: 'inline-flex' }}>
                <AppIcon name="paperclip" />
                <span className="sr-only">{t('inbox.attachment')}</span>
              </Box>
            )}
          </Stack>
        ),
      },
      {
        field: 'deletedAt',
        headerName: t('deleted.deletedAt'),
        width: 170,
        cellClassName: 'tmail-mono-cell',
        renderCell: (params) => (
          <Box component="time" dateTime={params.row.deletedAt} sx={{ fontFamily: MONO_FONT_FAMILY }}>
            {formatDate(params.row.deletedAt)}
          </Box>
        ),
      },
    ],
    [formatDate, openDetail, t],
  )

  return (
    <Box component="section" className="admin-section" aria-labelledby="deleted-mail-title" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="overline" className="eyebrow" color="text.secondary" sx={{ display: 'block', letterSpacing: '0.08em' }}>
          {t('deleted.eyebrow')}
        </Typography>
        <Typography id="deleted-mail-title" component="h1" variant="h4" sx={{ fontSize: '2rem', fontWeight: 500, lineHeight: 1.2 }}>
          {t('deleted.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" className="admin-note margin-bottom-md" sx={{ mt: 0.5 }}>
          {t('deleted.note')}
        </Typography>
      </Box>

      {selectedId ? (
        <Card component="article" className="message-reader panel" aria-live="polite" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box>
            <Button
              ref={backButtonRef}
              className="reader-back secondary-button"
              type="button"
              variant="outlined"
              data-action="close-deleted"
              disabled={actionBusy === 'delete'}
              onClick={closeDetail}
              startIcon={<AppIcon name="arrow-left" />}
            >
              {t('deleted.back')}
            </Button>
          </Box>

          {detailLoading ? (
            <Stack spacing={1.5} className="reader-loading">
              <Skeleton variant="text" width="30%" height={24} className="skeleton skeleton-label" />
              <Skeleton variant="text" width="60%" height={36} className="skeleton skeleton-title" />
              <Skeleton variant="rounded" height={180} className="skeleton skeleton-field" sx={{ borderRadius: '16px' }} />
              <span className="sr-only">{t('reader.loading')}</span>
            </Stack>
          ) : detailError ? (
            <Stack spacing={1.5} className="reader-state" sx={{ alignItems: 'flex-start' }}>
              <Typography component="h2" variant="h6">
                {t('reader.unavailable')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {detailError}
              </Typography>
              <Button className="secondary-button" type="button" variant="outlined" onClick={() => { void openDetail(selectedId) }}>
                {t('address.retry')}
              </Button>
            </Stack>
          ) : detail ? (
            <>
              <Stack
                component="header"
                direction={{ xs: 'column', md: 'row' }}
                className="reader-header"
                sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}
              >
                <Box>
                  <Typography variant="body2" color="text.secondary" className="reader-sender">
                    {formatAddress(detail.from)}
                  </Typography>
                  <Typography component="h2" variant="h5" sx={{ fontWeight: 500, mt: 0.25 }}>
                    {detail.subject || t('inbox.noSubject')}
                  </Typography>
                  <Typography component="time" dateTime={detail.receivedAt} variant="caption" color="text.secondary" sx={{ fontFamily: MONO_FONT_FAMILY }}>
                    {formatDate(detail.receivedAt)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap className="reader-actions" sx={{ flexWrap: 'wrap' }}>
                  {detail.hasSource ? (
                    <Button
                      className="secondary-button compact-button"
                      type="button"
                      variant="outlined"
                      size="small"
                      data-download-deleted-source=""
                      disabled={Boolean(actionBusy)}
                      onClick={() => { void downloadSource() }}
                      startIcon={<AppIcon name="file-down" />}
                    >
                      {actionBusy === 'source' ? t('reader.saving') : t('reader.downloadSource')}
                    </Button>
                  ) : (
                    <Chip size="small" label={t('deleted.sourceUnavailable')} className="status-pill pill-neutral" />
                  )}
                  <Button
                    className="danger-button compact-button"
                    type="button"
                    variant="contained"
                    color="error"
                    size="small"
                    data-action="delete-permanent"
                    disabled={Boolean(actionBusy)}
                    onClick={() => { void deletePermanently() }}
                    startIcon={<AppIcon name="trash-2" />}
                  >
                    {actionBusy === 'delete' ? t('deleted.deleting') : t('deleted.delete')}
                  </Button>
                </Stack>
              </Stack>

              <Box
                component="dl"
                className="message-meta"
                sx={(theme) => ({
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 1.5,
                  p: 2,
                  m: 0,
                  borderRadius: '16px',
                  bgcolor: theme.palette.m3.surfaceContainerLowest,
                  '& dt': { fontSize: '0.75rem', color: 'text.secondary', fontWeight: 500 },
                  '& dd': { m: 0, fontSize: '0.875rem', wordBreak: 'break-word' },
                })}
              >
                <div>
                  <dt>{t('deleted.mailbox')}</dt>
                  <dd className="font-mono" style={{ fontFamily: MONO_FONT_FAMILY }}>
                    {detail.mailboxAddress}
                  </dd>
                </div>
                <div>
                  <dt>{t('reader.to')}</dt>
                  <dd>{detail.to.map(formatAddress).join(', ') || t('reader.undisclosed')}</dd>
                </div>
                {detail.cc.length > 0 && (
                  <div>
                    <dt>{t('reader.cc')}</dt>
                    <dd>{detail.cc.map(formatAddress).join(', ')}</dd>
                  </div>
                )}
                {detail.bcc.length > 0 && (
                  <div>
                    <dt>{t('reader.bcc')}</dt>
                    <dd>{detail.bcc.map(formatAddress).join(', ')}</dd>
                  </div>
                )}
                <div>
                  <dt>{t('deleted.deletedAt')}</dt>
                  <dd>{formatDate(detail.deletedAt)}</dd>
                </div>
                <div>
                  <dt>{t('deleted.expiresAt')}</dt>
                  <dd>{formatDate(detail.expiresAt)}</dd>
                </div>
              </Box>

              {actionError && (
                <Alert severity="error" role="alert" className="reader-error" sx={{ borderRadius: '16px' }}>
                  {actionError}
                </Alert>
              )}

              <Stack spacing={2} className="reader-content-grid">
                {verificationCode && (
                  <Box
                    component="aside"
                    className="verification-code"
                    aria-label={t('reader.code')}
                    sx={(theme) => ({
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 1.5,
                      p: 2,
                      borderRadius: '20px',
                      bgcolor: theme.palette.m3.tertiaryContainer,
                      color: theme.palette.m3.onTertiaryContainer,
                    })}
                  >
                    <Stack direction="row" spacing={1.5} className="verification-code-lead" sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Stack direction="row" spacing={0.75} className="verification-code-badge" sx={{ alignItems: 'center' }}>
                        <AppIcon name="badge-check" />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {t('reader.code')}
                        </Typography>
                      </Stack>
                      <Box
                        component="code"
                        sx={{
                          fontFamily: MONO_FONT_FAMILY,
                          fontSize: '1.25rem',
                          fontWeight: 500,
                          letterSpacing: '0.12em',
                        }}
                      >
                        {verificationCode}
                      </Box>
                    </Stack>
                    <Button
                      className="primary-button compact-button"
                      type="button"
                      variant="contained"
                      size="small"
                      aria-label={t('inbox.copyCodeAction')}
                      onClick={() => { void copyVerificationCode() }}
                      startIcon={<AppIcon name="copy" />}
                      sx={(theme) => ({
                        bgcolor: theme.palette.m3.tertiary,
                        color: theme.palette.m3.onTertiary,
                        '&:hover': { bgcolor: theme.palette.m3.tertiary, filter: 'brightness(0.95)' },
                      })}
                    >
                      {t('address.copy')}
                    </Button>
                  </Box>
                )}

                <Stack spacing={1.5} className="reader-body">
                  {detail.html.length > 0 && Boolean(detail.text) && (
                    <Box className="body-switcher" aria-label={t('reader.format')}>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={bodyMode}
                        onChange={(_e, next: 'html' | 'text' | null) => {
                          if (next) setBodyMode(next)
                        }}
                      >
                        <ToggleButton value="html" aria-pressed={bodyMode === 'html'}>
                          {t('reader.html')}
                        </ToggleButton>
                        <ToggleButton value="text" aria-pressed={bodyMode === 'text'}>
                          {t('reader.text')}
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>
                  )}

                  {detail.html.length > 0 && bodyMode === 'html' ? (
                    <AdminSandboxFrame
                      html={detail.html.join('\n')}
                      mode="message"
                      title={t('reader.title', { subject: detail.subject || t('inbox.noSubject') })}
                    />
                  ) : (
                    <Box
                      component="pre"
                      className="plain-message"
                      sx={(theme) => ({
                        m: 0,
                        p: 2,
                        borderRadius: '16px',
                        bgcolor: theme.palette.m3.surfaceContainerLowest,
                        border: `1px solid ${theme.palette.m3.outlineVariant}`,
                        fontFamily: MONO_FONT_FAMILY,
                        fontSize: '0.85rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        overflowX: 'auto',
                      })}
                    >
                      {detail.text || t('reader.empty')}
                    </Box>
                  )}
                </Stack>
              </Stack>

              {detail.attachments.length > 0 && (
                <Box component="section" className="attachments" aria-labelledby="deleted-attachments-title">
                  <Typography id="deleted-attachments-title" component="h3" variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
                    {t('reader.attachments')}
                  </Typography>
                  <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                    {detail.attachments.map((attachment) => (
                      <Box
                        component="li"
                        key={attachment.id}
                        sx={(theme) => ({
                          p: 1.5,
                          borderRadius: '14px',
                          bgcolor: theme.palette.m3.surfaceContainerLowest,
                          border: `1px solid ${theme.palette.m3.outlineVariant}`,
                        })}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {safeFilename(attachment.filename, 'attachment', 120)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatBytes(attachment.size)} · {attachment.contentType}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </>
          ) : null}
        </Card>
      ) : (
        <Card className="panel message-list" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            className="list-heading"
            sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, gap: 2 }}
          >
            <Box>
              <Typography ref={listHeadingRef} tabIndex={-1} component="h2" variant="h6" sx={{ fontWeight: 500 }}>
                {t('deleted.title')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('inbox.total', { count: totalItems })}
              </Typography>
            </Box>
            <Stack
              component="form"
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              className="inline-add-row"
              onSubmit={submitSearch}
              sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}
            >
              <TextField
                id="deleted-mail-search"
                type="search"
                size="small"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('deleted.searchPlaceholder')}
                slotProps={{ htmlInput: { 'aria-label': t('deleted.searchLabel') } }}
                sx={{ minWidth: { sm: 240 } }}
              />
              <Button className="secondary-button" type="submit" variant="outlined" disabled={loading}>
                {t('deleted.search')}
              </Button>
              {activeQuery && (
                <Button className="text-button" type="button" variant="text" disabled={loading} onClick={() => { void clearSearch() }}>
                  {t('deleted.clear')}
                </Button>
              )}
            </Stack>
          </Stack>

          {loading ? (
            <Stack spacing={1.25} className="message-list-state" aria-live="polite">
              <Skeleton variant="rounded" height={52} className="skeleton skeleton-field" sx={{ borderRadius: '14px' }} />
              <Skeleton variant="rounded" height={52} className="skeleton skeleton-field" sx={{ borderRadius: '14px' }} />
              <Skeleton variant="rounded" height={52} className="skeleton skeleton-field" sx={{ borderRadius: '14px' }} />
              <span className="sr-only">{t('deleted.loading')}</span>
            </Stack>
          ) : error ? (
            <Stack spacing={1.5} className="message-list-state" role="alert" sx={{ alignItems: 'flex-start' }}>
              <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 500 }}>
                {t('error.deletedLoad')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {error}
              </Typography>
              <Button
                className="secondary-button compact-button"
                type="button"
                variant="outlined"
                onClick={() => { void loadList(page, activeQuery, limit) }}
              >
                {t('address.retry')}
              </Button>
            </Stack>
          ) : !items.length ? (
            <Box className="message-list-state" sx={{ py: 3, textAlign: 'center' }}>
              <Typography component="h3" variant="subtitle1" color="text.secondary">
                {activeQuery ? t('deleted.noResults') : t('deleted.empty')}
              </Typography>
            </Box>
          ) : (
            <TMailDataGrid<DeletedMessageSummary>
              rows={items}
              columns={columns}
              ariaLabel={t('deleted.title')}
              minWidth={640}
              rowHeight={60}
              paginationMode="server"
              rowCount={totalItems}
              paginationModel={{ page: page - 1, pageSize: limit }}
              pageSizeOptions={[10, 20, 50]}
              onPaginationModelChange={(model) => {
                const nextPage = model.page + 1
                const nextLimit = model.pageSize
                setPage(nextPage)
                setLimit(nextLimit)
                void loadList(nextPage, activeQuery, nextLimit)
              }}
              onRowClick={(params) => {
                void openDetail(params.row.id)
              }}
              sx={{
                '& .MuiDataGrid-row': { cursor: 'pointer' },
              }}
            />
          )}
        </Card>
      )}
    </Box>
  )
}

export default DeletedMailTab
