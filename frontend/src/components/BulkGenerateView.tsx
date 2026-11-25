import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import type { GridColDef } from '@mui/x-data-grid'
import { ApiError, api } from '../api'
import { copyText } from '../clipboard'
import { downloadCsv } from '../csv'
import { getI18n, useI18n } from '../i18n'
import { MONO_FONT_FAMILY } from '../muiTheme'
import { randomAddressBatch } from '../randomAddress'
import { useToast } from '../toast'
import type { DomainResource } from '../types'
import { AppIcon } from './AppIcon'
import { TMailDataGrid } from './TMailDataGrid'

export interface BulkGenerateViewProps {
  accessToken?: string
}

interface GeneratedAddressRow {
  id: string
  address: string
}

export function BulkGenerateView({ accessToken = '' }: BulkGenerateViewProps) {
  const { t } = useI18n()
  const toast = useToast()

  const [domains, setDomains] = useState<DomainResource[]>([])
  const [loadingDomains, setLoadingDomains] = useState(true)
  const [domainError, setDomainError] = useState('')
  const [countInput, setCountInput] = useState('10')
  const [addresses, setAddresses] = useState<string[]>([])
  const [copiedAddress, setCopiedAddress] = useState('')
  const [partialCount, setPartialCount] = useState<number | null>(null)

  const domainsVersionRef = useRef(0)
  const prevAccessTokenRef = useRef(accessToken)

  const loadDomains = useCallback(async (token: string) => {
    const version = ++domainsVersionRef.current
    setLoadingDomains(true)
    setDomainError('')
    try {
      const response = await api.domains(1, token || undefined)
      if (version !== domainsVersionRef.current) return
      setDomains(response['hydra:member'].filter((domain) => domain.isActive !== false))
    } catch (cause) {
      if (version !== domainsVersionRef.current) return
      setDomainError(cause instanceof ApiError ? cause.message : getI18n().t('error.unavailable'))
    } finally {
      if (version === domainsVersionRef.current) setLoadingDomains(false)
    }
  }, [])

  useEffect(() => {
    if (prevAccessTokenRef.current !== accessToken) {
      prevAccessTokenRef.current = accessToken
      setAddresses([])
      setCopiedAddress('')
      setPartialCount(null)
    }
    void loadDomains(accessToken)
    return () => {
      domainsVersionRef.current += 1
    }
  }, [accessToken, loadDomains])

  const generate = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const requested = Math.min(10, Math.max(1, Number(countInput) || 1))
    setCountInput(String(requested))
    const next = randomAddressBatch(
      domains.map((domain) => domain.domain),
      requested,
    )
    setAddresses(next)
    setCopiedAddress('')
    setPartialCount(next.length < requested ? next.length : null)
  }, [countInput, domains])

  const openInNewTab = useCallback((address: string) => {
    window.open(`/${encodeURIComponent(address)}`, '_blank', 'noopener')
  }, [])

  const copy = useCallback(async (address: string) => {
    try {
      await copyText(address)
      setCopiedAddress(address)
      toast.success(getI18n().t('bulk.copiedNotice'))
    } catch {
      toast.error(getI18n().t('error.copy'))
    }
  }, [toast])

  const copyAll = useCallback(async () => {
    try {
      await copyText(addresses.join('\n'))
      toast.success(getI18n().t('bulk.copiedAllNotice'))
    } catch {
      toast.error(getI18n().t('error.copy'))
    }
  }, [addresses, toast])

  const exportCsv = useCallback(() => {
    if (!addresses.length) return
    const header = 'address\n'
    const rows = addresses.map((addr) => `"${addr.replace(/"/g, '""')}"`).join('\n')
    downloadCsv('tmail-addresses.csv', header + rows + '\n')
  }, [addresses])

  const rows = useMemo<GeneratedAddressRow[]>(
    () => addresses.map((address) => ({ id: address, address })),
    [addresses],
  )

  const columns = useMemo<GridColDef<GeneratedAddressRow>[]>(() => [
    {
      field: 'address',
      headerName: t('address.email'),
      flex: 1,
      minWidth: 220,
      cellClassName: 'tmail-mono-cell',
      renderCell: (params) => (
        <Typography
          component="span"
          className="saved-address"
          sx={{
            fontFamily: MONO_FONT_FAMILY,
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {params.row.address}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: t('bulkCode.actions'),
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      width: 196,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => {
        const address = params.row.address
        const isCopied = copiedAddress === address
        return (
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ width: '100%', alignItems: 'center', justifyContent: 'flex-end' }}
          >
            <Button
              className="text-button"
              type="button"
              size="small"
              variant="text"
              startIcon={<AppIcon name={isCopied ? 'check' : 'copy'} />}
              onClick={() => void copy(address)}
              sx={{
                minHeight: 36,
                px: 1.5,
                color: (theme) => (isCopied ? theme.palette.m3.success : theme.palette.primary.main),
              }}
            >
              {isCopied ? t('bulk.copied') : t('bulk.copy')}
            </Button>
            <Tooltip title={t('bulk.open')}>
              <IconButton
                className="bulk-open-button"
                type="button"
                size="small"
                aria-label={t('bulk.open')}
                onClick={() => openInNewTab(address)}
                sx={{
                  color: (theme) => theme.palette.m3.onSurfaceVariant,
                  '&:hover': {
                    bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
                  },
                }}
              >
                <AppIcon name="external-link" />
              </IconButton>
            </Tooltip>
          </Stack>
        )
      },
    },
  ], [copiedAddress, copy, openInNewTab, t])

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Box component="header" className="page-header" sx={{ mb: 2.5 }}>
        <Typography
          id="bulk-title"
          component="h1"
          variant="h4"
          sx={{
            fontSize: { xs: '1.5rem', sm: '2rem' },
            fontWeight: 500,
            color: (theme) => theme.palette.m3.onSurface,
            mb: 0.75,
          }}
        >
          {t('bulk.title')}
        </Typography>
        <Typography
          className="lede"
          variant="body1"
          sx={{ color: (theme) => theme.palette.m3.onSurfaceVariant }}
        >
          {t('bulk.lede')}
        </Typography>
      </Box>

      {loadingDomains ? (
        <Card
          className="panel loading-panel"
          aria-live="polite"
          sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}
        >
          <Stack spacing={1.5}>
            <Skeleton variant="text" width={160} height={24} className="skeleton skeleton-label" />
            <Skeleton variant="rounded" width="100%" height={48} className="skeleton skeleton-field" sx={{ borderRadius: '12px' }} />
            <Skeleton variant="rounded" width={140} height={40} className="skeleton skeleton-button" sx={{ borderRadius: '9999px' }} />
          </Stack>
          <span className="sr-only">{t('address.loading')}</span>
        </Card>
      ) : domainError ? (
        <Card
          className="panel empty-state"
          role="alert"
          sx={{ p: { xs: 2.5, sm: 3.5 }, minWidth: 0 }}
        >
          <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
            <Typography component="h2" variant="h6" sx={{ color: (theme) => theme.palette.m3.onSurface }}>
              {t('address.failed')}
            </Typography>
            <Typography variant="body2" sx={{ color: (theme) => theme.palette.m3.onSurfaceVariant }}>
              {domainError}
            </Typography>
            <Button
              type="button"
              variant="contained"
              onClick={() => void loadDomains(accessToken)}
            >
              {t('address.retry')}
            </Button>
          </Stack>
        </Card>
      ) : domains.length === 0 ? (
        <Card
          className="panel empty-state"
          sx={{ p: { xs: 2.5, sm: 3.5 }, minWidth: 0 }}
        >
          <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
            <Typography component="h2" variant="h6" sx={{ color: (theme) => theme.palette.m3.onSurface }}>
              {t('address.none')}
            </Typography>
            <Typography variant="body2" sx={{ color: (theme) => theme.palette.m3.onSurfaceVariant }}>
              {t('address.noneHelp')}
            </Typography>
            <Button type="button" variant="contained" disabled>
              {t('bulk.generate')}
            </Button>
          </Stack>
        </Card>
      ) : (
        <Card
          component="section"
          className="panel bulk-panel"
          aria-labelledby="bulk-title"
          sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}
        >
          <Box
            component="form"
            className="bulk-controls"
            onSubmit={generate}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: 1.5,
              mb: 2.5,
            }}
          >
            <TextField
              id="bulk-count"
              label={t('bulk.countLabel')}
              type="number"
              value={countInput}
              onChange={(event) => setCountInput(event.target.value)}
              size="small"
              slotProps={{
                htmlInput: { min: 1, max: 10 },
              }}
              sx={{
                minWidth: 160,
                flex: { xs: '1 1 160px', sm: '0 0 200px' },
              }}
            />
            <Button
              className="primary-button"
              type="submit"
              variant="contained"
              startIcon={<AppIcon name="mails" />}
            >
              {t('bulk.generate')}
            </Button>
          </Box>

          <Box className="bulk-results" aria-live="polite" sx={{ minWidth: 0 }}>
            {partialCount !== null && (
              <Box
                className="bulk-partial"
                role="status"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1.25,
                  mb: 2,
                  borderRadius: '12px',
                  bgcolor: (theme) => theme.palette.m3.warningContainer,
                  color: (theme) => theme.palette.m3.onWarningContainer,
                }}
              >
                <AppIcon name="alert-triangle" />
                <Typography variant="body2" sx={{ color: 'inherit', fontWeight: 500 }}>
                  {t('bulk.partial', { count: partialCount })}
                </Typography>
              </Box>
            )}

            {addresses.length === 0 ? (
              <Typography
                className="empty-copy"
                variant="body2"
                sx={{ color: (theme) => theme.palette.m3.onSurfaceVariant }}
              >
                {t('bulk.empty')}
              </Typography>
            ) : (
              <Stack spacing={2} sx={{ minWidth: 0 }}>
                <Stack
                  direction="row"
                  spacing={1.25}
                  className="bulk-actions-bar"
                  sx={{ flexWrap: 'wrap', rowGap: 1.25 }}
                >
                  <Button
                    className="secondary-button compact-button bulk-copy-all"
                    type="button"
                    variant="contained"
                    startIcon={<AppIcon name="copy" />}
                    onClick={() => void copyAll()}
                    sx={{
                      bgcolor: (theme) => theme.palette.m3.secondaryContainer,
                      color: (theme) => theme.palette.m3.onSecondaryContainer,
                      '&:hover': {
                        bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
                      },
                    }}
                  >
                    {t('bulk.copyAll')}
                  </Button>
                  <Button
                    className="secondary-button compact-button bulk-export-csv"
                    type="button"
                    variant="contained"
                    startIcon={<AppIcon name="download" />}
                    onClick={exportCsv}
                    sx={{
                      bgcolor: (theme) => theme.palette.m3.secondaryContainer,
                      color: (theme) => theme.palette.m3.onSecondaryContainer,
                      '&:hover': {
                        bgcolor: (theme) => theme.palette.m3.surfaceContainerHigh,
                      },
                    }}
                  >
                    {t('bulk.exportCsv')}
                  </Button>
                </Stack>

                <TMailDataGrid<GeneratedAddressRow>
                  rows={rows}
                  columns={columns}
                  minWidth={420}
                  ariaLabel={t('bulk.title')}
                  hideFooter={rows.length <= 10}
                  rowHeight={56}
                />
              </Stack>
            )}
          </Box>
        </Card>
      )}
    </Box>
  )
}

export default BulkGenerateView
