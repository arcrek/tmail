import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { DataGrid, type DataGridProps, type GridValidRowModel } from '@mui/x-data-grid'
import { getCspNonce } from '../emotionCache'
import { MONO_FONT_FAMILY } from '../muiTheme'

export interface TMailDataGridProps<R extends GridValidRowModel = GridValidRowModel>
  extends Omit<DataGridProps<R>, 'rows' | 'columns'> {
  rows: readonly R[]
  columns: DataGridProps<R>['columns']
  emptyText?: string
  minWidth?: number
  ariaLabel?: string
}

const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)

export function TMailDataGrid<R extends GridValidRowModel = GridValidRowModel>({
  rows,
  columns,
  emptyText,
  minWidth,
  ariaLabel,
  pageSizeOptions = [10, 25, 50],
  initialState,
  sx,
  ...rest
}: TMailDataGridProps<R>) {
  return (
    <Box
      sx={{
        width: '100%',
        overflowX: 'auto',
        borderRadius: '20px',
        bgcolor: (theme) => theme.palette.m3.surfaceContainerLowest,
        border: (theme) => `1px solid ${theme.palette.m3.outlineVariant}`,
      }}
    >
      <Box sx={{ minWidth: minWidth ?? '100%' }}>
        <DataGrid<R>
          rows={rows}
          columns={columns}
          nonce={getCspNonce()}
          aria-label={ariaLabel}
          disableRowSelectionOnClick
          disableColumnMenu={false}
          disableVirtualization={isJsdom || rows.length <= 100}
          pageSizeOptions={pageSizeOptions}
          initialState={
            initialState ?? {
              pagination: { paginationModel: { pageSize: 10, page: 0 } },
            }
          }
          slots={
            emptyText
              ? {
                  noRowsOverlay: () => (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        p: 3,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {emptyText}
                      </Typography>
                    </Box>
                  ),
                }
              : undefined
          }
          sx={[
            (theme) => ({
              border: 0,
              borderRadius: '20px',
              bgcolor: theme.palette.m3.surfaceContainerLowest,
              color: theme.palette.m3.onSurface,
              '--DataGrid-containerBackground': theme.palette.m3.surfaceContainerLow,
              '--DataGrid-rowBorderColor': theme.palette.m3.outlineVariant,
              '& .MuiDataGrid-columnHeaders': {
                bgcolor: theme.palette.m3.surfaceContainerLow,
                color: theme.palette.m3.onSurfaceVariant,
                fontWeight: 600,
                fontSize: '0.8125rem',
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 600,
              },
              '& .MuiDataGrid-cell': {
                display: 'flex',
                alignItems: 'center',
                py: 1,
                borderColor: theme.palette.m3.outlineVariant,
              },
              '& .MuiDataGrid-row:hover': {
                bgcolor: theme.palette.m3.surfaceContainerLow,
              },
              '& .tmail-mono-cell': {
                fontFamily: MONO_FONT_FAMILY,
                fontSize: '0.84rem',
              },
              '& .MuiDataGrid-footerContainer': {
                borderTop: `1px solid ${theme.palette.m3.outlineVariant}`,
                bgcolor: theme.palette.m3.surfaceContainerLowest,
              },
              '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: '-2px',
              },
            }),
            ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
          ]}
          {...rest}
        />
      </Box>
    </Box>
  )
}
