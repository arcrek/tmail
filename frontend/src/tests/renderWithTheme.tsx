import { type ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { createTMailTheme, type BrandOverrides } from '../muiTheme'
import type { ThemeMode } from '../theme'

export interface RenderWithThemeOptions extends Omit<RenderOptions, 'wrapper'> {
  mode?: ThemeMode
  brand?: BrandOverrides
}

export function renderWithTheme(ui: ReactElement, options: RenderWithThemeOptions = {}) {
  const { mode = 'light', brand, ...renderOptions } = options
  const theme = createTMailTheme(mode, brand)
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {ui}
    </ThemeProvider>,
    renderOptions,
  )
}
