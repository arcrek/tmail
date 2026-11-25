import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import { useI18n } from '../i18n'

export interface SandboxFrameProps {
  html: string
  css?: string
  mode?: 'message' | 'content'
  title?: string
  className?: string
}

const SANDBOX_PERMISSIONS = 'allow-scripts allow-popups allow-popups-to-escape-sandbox'

/** Resolved page scheme: an explicit `data-theme` choice wins, otherwise the OS preference. */
function pageScheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined') {
    const explicit = document.documentElement.dataset.theme
    if (explicit === 'light' || explicit === 'dark') return explicit
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function SandboxFrame({
  html,
  css = '',
  mode = 'message',
  title = '',
  className = '',
}: SandboxFrameProps) {
  const { t } = useI18n()
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const sentMessageRevisionRef = useRef(-1)

  // Site content frames follow the page theme; message frames keep the email's own light canvas.
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() => pageScheme())
  const effectiveScheme = mode === 'content' ? colorScheme : ''
  const depsKey = `${mode}\0${html}\0${css}\0${effectiveScheme}`

  const [revState, setRevState] = useState(() => ({ revision: 0, depsKey }))
  let revision = revState.revision
  if (revState.depsKey !== depsKey) {
    revision = revState.revision + 1
    setRevState({ revision, depsKey })
  }

  const [heightState, setHeightState] = useState<{ revision: number; height: number | null }>({
    revision: 0,
    height: null,
  })
  const frameHeight = heightState.revision === revision ? heightState.height : null

  const latestRef = useRef({ html, css, mode, colorScheme, revision })
  latestRef.current = { html, css, mode, colorScheme, revision }

  function sendContent(): void {
    const target = frameRef.current?.contentWindow
    const cur = latestRef.current
    if (!target || (cur.mode === 'message' && sentMessageRevisionRef.current === cur.revision)) return
    if (cur.mode === 'message') sentMessageRevisionRef.current = cur.revision
    target.postMessage(
      {
        type: 'tmail:sandbox-content',
        html: cur.html,
        css: cur.css,
        mode: cur.mode,
        ...(cur.mode === 'content' ? { colorScheme: cur.colorScheme } : {}),
      },
      '*',
    )
  }

  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent): void => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { type?: unknown; height?: unknown } | null | undefined
      if (!data || typeof data !== 'object') return
      if (data.type === 'tmail:sandbox-ready') {
        sentMessageRevisionRef.current = -1
        sendContent()
      } else if (
        data.type === 'tmail:sandbox-height' &&
        typeof data.height === 'number' &&
        Number.isFinite(data.height) &&
        data.height > 0
      ) {
        setHeightState({ revision: latestRef.current.revision, height: Math.ceil(data.height) })
      }
    }

    window.addEventListener('message', handleWindowMessage)
    return () => {
      window.removeEventListener('message', handleWindowMessage)
    }
  }, [])

  useEffect(() => {
    if (mode !== 'content') return
    const update = () => setColorScheme(pageScheme())
    update()

    const observer =
      typeof MutationObserver !== 'undefined' && typeof document !== 'undefined'
        ? new MutationObserver(update)
        : null
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const media =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    media?.addEventListener?.('change', update)

    return () => {
      observer?.disconnect()
      media?.removeEventListener?.('change', update)
    }
  }, [mode])

  const sourceUrl = `${mode === 'message' ? '/message-sandbox' : '/sandbox'}?revision=${revision}`
  const resolvedTitle = title || (mode === 'message' ? t('app.messageContent') : t('app.siteContent'))
  const classes = className ? `sandbox-frame ${className}` : 'sandbox-frame'
  const isSiteContent = className.split(/\s+/).includes('site-content-frame')
  const isSiteHeader = className.split(/\s+/).includes('site-header-frame')
  const isSiteFooter = className.split(/\s+/).includes('site-footer-frame')
  const isAdFrame = className.split(/\s+/).includes('ad-frame')

  return (
    <Box
      key={revision}
      ref={frameRef}
      component="iframe"
      className={classes}
      sandbox={SANDBOX_PERMISSIONS}
      src={sourceUrl}
      title={resolvedTitle}
      onLoad={sendContent}
      sx={(theme) => ({
        display: 'block',
        width: '100%',
        ...(isSiteContent
          ? {
              minHeight: 0,
              border: 0,
              borderRadius: 0,
              bgcolor: 'transparent',
              borderBottom: `1px solid ${theme.palette.m3.outlineVariant}`,
              ...(isSiteHeader ? { height: '68px' } : {}),
              ...(isSiteFooter
                ? {
                    height: '69px',
                    borderTop: `1px solid ${theme.palette.m3.outlineVariant}`,
                  }
                : {}),
              ...(isAdFrame ? { height: '90px' } : {}),
            }
          : {
              minHeight: mode === 'message' ? '31rem' : '14rem',
              border: `1px solid ${theme.palette.m3.outlineVariant}`,
              borderRadius: '16px',
              // Arbitrary email HTML keeps its own colors on a white sheet in both schemes.
              bgcolor: '#ffffff',
            }),
        ...(frameHeight ? { height: `${frameHeight}px`, minHeight: `${frameHeight}px` } : {}),
      })}
    />
  )
}

export default SandboxFrame
