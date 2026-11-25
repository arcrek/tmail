import { alpha, createTheme, type Theme } from '@mui/material/styles'
import type { ThemeMode } from './theme'

export interface M3PaletteTokens {
  surface: string
  surfaceContainerLowest: string
  surfaceContainerLow: string
  surfaceContainer: string
  surfaceContainerHigh: string
  surfaceContainerHighest: string
  onSurface: string
  onSurfaceVariant: string
  outline: string
  outlineVariant: string
  primaryContainer: string
  onPrimaryContainer: string
  secondaryContainer: string
  onSecondaryContainer: string
  tertiary: string
  onTertiary: string
  tertiaryContainer: string
  onTertiaryContainer: string
  errorContainer: string
  onErrorContainer: string
  warning: string
  warningContainer: string
  onWarningContainer: string
  success: string
}

declare module '@mui/material/styles' {
  interface Palette {
    m3: M3PaletteTokens
  }
  interface PaletteOptions {
    m3?: M3PaletteTokens
  }
}

export const SANS_FONT_FAMILY =
  "'Roboto Flex Variable', 'Roboto Flex', 'Roboto', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
export const MONO_FONT_FAMILY =
  "'Roboto Mono Variable', 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function sanitizeHexColor(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value : fallback
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

function mixHex(a: string, b: string, weightA: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const w = Math.max(0, Math.min(1, weightA))
  const r = Math.round(r1 * w + r2 * (1 - w))
  const g = Math.round(g1 * w + g2 * (1 - w))
  const bl = Math.round(b1 * w + b2 * (1 - w))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export interface BrandOverrides {
  primaryColor?: string
  accentColor?: string
}

const DEFAULT_LIGHT_PRIMARY = '#345CA8'
const DEFAULT_DARK_PRIMARY = '#ADC6FF'

export function createTMailTheme(mode: ThemeMode, brand?: BrandOverrides): Theme {
  const isDark = mode === 'dark'
  const customPrimary = brand?.primaryColor && HEX_COLOR.test(brand.primaryColor) ? brand.primaryColor : undefined
  const customAccent = brand?.accentColor && HEX_COLOR.test(brand.accentColor) ? brand.accentColor : undefined

  const primaryMain = customPrimary
    ? isDark
      ? mixHex(customPrimary, '#ffffff', 0.35)
      : customPrimary
    : isDark
      ? DEFAULT_DARK_PRIMARY
      : DEFAULT_LIGHT_PRIMARY

  const primaryContrast = relativeLuminance(primaryMain) > 0.38 ? '#002E69' : '#FFFFFF'
  const primaryDark = customAccent
    ? isDark
      ? mixHex(customAccent, '#ffffff', 0.25)
      : customAccent
    : mixHex(primaryMain, isDark ? '#ffffff' : '#000000', 0.85)

  const m3: M3PaletteTokens = isDark
    ? {
        surface: '#111318',
        surfaceContainerLowest: '#0C0E13',
        surfaceContainerLow: '#191C20',
        surfaceContainer: '#1D2024',
        surfaceContainerHigh: '#282A2F',
        surfaceContainerHighest: '#33353A',
        onSurface: '#E2E2E9',
        onSurfaceVariant: '#C4C6D0',
        outline: '#8E9099',
        outlineVariant: '#44474F',
        primaryContainer: customPrimary ? mixHex(customPrimary, '#111318', 0.42) : '#1B4487',
        onPrimaryContainer: '#D8E2FF',
        secondaryContainer: '#3E4759',
        onSecondaryContainer: '#DAE2F9',
        tertiary: '#80D5D4',
        onTertiary: '#003737',
        tertiaryContainer: '#004F4F',
        onTertiaryContainer: '#9CF1F0',
        errorContainer: '#93000A',
        onErrorContainer: '#FFDAD6',
        warning: '#FFB870',
        warningContainer: '#653E00',
        onWarningContainer: '#FFDDB3',
        success: '#8FD88A',
      }
    : {
        surface: '#F9F9FF',
        surfaceContainerLowest: '#FFFFFF',
        surfaceContainerLow: '#F1F3FA',
        surfaceContainer: '#EDEDF4',
        surfaceContainerHigh: '#E5E7EE',
        surfaceContainerHighest: '#E2E2E9',
        onSurface: '#1A1B20',
        onSurfaceVariant: '#44474F',
        outline: '#74777F',
        outlineVariant: '#C4C6D0',
        primaryContainer: customPrimary ? mixHex(customPrimary, '#ffffff', 0.18) : '#D8E2FF',
        onPrimaryContainer: '#001A41',
        secondaryContainer: '#DAE2F9',
        onSecondaryContainer: '#131C2B',
        tertiary: '#006A6A',
        onTertiary: '#FFFFFF',
        tertiaryContainer: '#9CF1F0',
        onTertiaryContainer: '#002020',
        errorContainer: '#FFDAD6',
        onErrorContainer: '#410002',
        warning: '#7C4A00',
        warningContainer: '#FFDDB3',
        onWarningContainer: '#291800',
        success: '#2E6B30',
      }

  const errorMain = isDark ? '#FFB4AB' : '#BA1A1A'
  const errorContrast = isDark ? '#690005' : '#FFFFFF'

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryMain,
        dark: primaryDark,
        light: m3.primaryContainer,
        contrastText: primaryContrast,
      },
      secondary: {
        main: m3.secondaryContainer,
        contrastText: m3.onSecondaryContainer,
      },
      error: {
        main: errorMain,
        contrastText: errorContrast,
      },
      warning: {
        main: m3.warning,
        contrastText: m3.onWarningContainer,
      },
      success: {
        main: m3.success,
      },
      info: {
        main: m3.tertiary,
        contrastText: m3.onTertiary,
      },
      background: {
        default: m3.surface,
        paper: m3.surfaceContainerLow,
      },
      text: {
        primary: m3.onSurface,
        secondary: m3.onSurfaceVariant,
      },
      divider: m3.outlineVariant,
      m3,
    },
    typography: {
      fontFamily: SANS_FONT_FAMILY,
      h1: { fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1 },
      h2: { fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.2 },
      h3: { fontWeight: 500, lineHeight: 1.25 },
      h4: { fontWeight: 500, lineHeight: 1.3 },
      h5: { fontWeight: 500, lineHeight: 1.35 },
      h6: { fontWeight: 500, lineHeight: 1.4 },
      button: {
        fontWeight: 500,
        textTransform: 'none',
        letterSpacing: '0.01em',
      },
    },
    shape: {
      borderRadius: 16,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: m3.surface,
            color: m3.onSurface,
            margin: 0,
            minHeight: '100dvh',
            fontFamily: SANS_FONT_FAMILY,
          },
          'a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible': {
            outline: `3px solid ${primaryMain}`,
            outlineOffset: 2,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 9999,
            minHeight: 40,
            paddingLeft: 20,
            paddingRight: 20,
            whiteSpace: 'nowrap',
            transition: 'background-color 150ms cubic-bezier(0.2, 0, 0, 1), color 150ms cubic-bezier(0.2, 0, 0, 1), transform 150ms cubic-bezier(0.2, 0, 0, 1)',
          },
          sizeLarge: {
            minHeight: 48,
            paddingLeft: 24,
            paddingRight: 24,
          },
          outlined: {
            borderColor: m3.outline,
            color: m3.onSurface,
            '&:hover': {
              borderColor: primaryMain,
              backgroundColor: alpha(primaryMain, 0.08),
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            minWidth: 40,
            minHeight: 40,
            borderRadius: 9999,
            color: m3.onSurfaceVariant,
            '@media (max-width: 768px)': {
              minWidth: 44,
              minHeight: 44,
            },
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: m3.surfaceContainerLow,
            borderRadius: 28,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            height: 32,
            fontWeight: 500,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: m3.surfaceContainerLowest,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: m3.outlineVariant,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: m3.outline,
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 28,
            backgroundColor: m3.surfaceContainerLow,
            margin: 16,
            maxWidth: 'calc(100vw - 32px)',
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            borderRadius: 9999,
            border: `1px solid ${m3.outline}`,
            overflow: 'hidden',
          },
          grouped: {
            border: 0,
            borderRadius: 9999,
            padding: '8px 18px',
            minHeight: 40,
            color: m3.onSurface,
            '&.Mui-selected': {
              backgroundColor: m3.secondaryContainer,
              color: m3.onSecondaryContainer,
              '&:hover': {
                backgroundColor: m3.secondaryContainer,
              },
            },
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          enterDelay: 350,
        },
      },
    },
  })
}
