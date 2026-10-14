<script setup lang="ts">
/**
 * Inline Lucide-derived 24x24 stroke icons (ISC-licensed path data, no runtime dependency).
 * Add new names to IconName + ICONS together; each shape is rendered as its own SVG tag so
 * we avoid v-html (works reliably across the jsdom test environment and real browsers alike).
 */
import { computed } from 'vue'

export type IconName =
  | 'home'
  | 'copy'
  | 'check'
  | 'check-circle'
  | 'refresh-cw'
  | 'plus'
  | 'trash-2'
  | 'download'
  | 'file-down'
  | 'bell'
  | 'bell-ring'
  | 'sun'
  | 'moon'
  | 'arrow-left'
  | 'paperclip'
  | 'external-link'
  | 'file-text'
  | 'book-open'
  | 'sparkles'
  | 'shuffle'
  | 'shield'
  | 'shield-check'
  | 'shield-cog'
  | 'clock-shield'
  | 'menu'
  | 'x'
  | 'volume-2'
  | 'volume-x'
  | 'qr'
  | 'layout-dashboard'
  | 'sliders'
  | 'server'
  | 'globe'
  | 'globe-plus'
  | 'key'
  | 'lock'
  | 'unlock'
  | 'log-out'
  | 'badge-check'
  | 'code-2'
  | 'scan-code'
  | 'alert-triangle'
  | 'mail'
  | 'brand-mail'
  | 'mail-open'
  | 'mail-plus'
  | 'mails'
  | 'inbox'
  | 'clock'
  | 'calendar-range'
  | 'trending-up'
  | 'activity'
type Shape = { tag: 'path' | 'circle' | 'rect' | 'line' | 'polyline'; attrs: Record<string, string> }

const props = defineProps<{ name: IconName }>()

const ICONS: Record<IconName, Shape[]> = {
  home: [
    { tag: 'path', attrs: { d: 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' } },
    { tag: 'polyline', attrs: { points: '9 22 9 12 15 12 15 22' } },
  ],
  copy: [
    { tag: 'rect', attrs: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' } },
    { tag: 'path', attrs: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' } },
  ],
  check: [
    { tag: 'path', attrs: { d: 'M20 6 9 17l-5-5' } },
  ],
  'check-circle': [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
    { tag: 'path', attrs: { d: 'm9 12 2 2 4-4' } },
  ],
  'refresh-cw': [
    { tag: 'path', attrs: { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' } },
    { tag: 'path', attrs: { d: 'M21 3v5h-5' } },
    { tag: 'path', attrs: { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' } },
    { tag: 'path', attrs: { d: 'M8 16H3v5' } },
  ],
  plus: [
    { tag: 'path', attrs: { d: 'M5 12h14' } },
    { tag: 'path', attrs: { d: 'M12 5v14' } },
  ],
  'trash-2': [
    { tag: 'path', attrs: { d: 'M10 11v6' } },
    { tag: 'path', attrs: { d: 'M14 11v6' } },
    { tag: 'path', attrs: { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' } },
    { tag: 'path', attrs: { d: 'M3 6h18' } },
    { tag: 'path', attrs: { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' } },
  ],
  download: [
    { tag: 'path', attrs: { d: 'M12 15V3' } },
    { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
    { tag: 'path', attrs: { d: 'm7 10 5 5 5-5' } },
  ],
  'file-down': [
    {
      tag: 'path',
      attrs: {
        d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
      },
    },
    { tag: 'path', attrs: { d: 'M14 2v5a1 1 0 0 0 1 1h5' } },
    { tag: 'path', attrs: { d: 'M12 18v-6' } },
    { tag: 'path', attrs: { d: 'm9 15 3 3 3-3' } },
  ],
  bell: [
    { tag: 'path', attrs: { d: 'M10.268 21a2 2 0 0 0 3.464 0' } },
    {
      tag: 'path',
      attrs: {
        d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
      },
    },
  ],
  'bell-ring': [
    { tag: 'path', attrs: { d: 'M10.268 21a2 2 0 0 0 3.464 0' } },
    {
      tag: 'path',
      attrs: {
        d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
      },
    },
    { tag: 'path', attrs: { d: 'M4 2C2.8 3.7 2 5.7 2 8' } },
    { tag: 'path', attrs: { d: 'M22 8c0-2.3-.8-4.3-2-6' } },
  ],
  sun: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '4' } },
    { tag: 'path', attrs: { d: 'M12 2v2' } },
    { tag: 'path', attrs: { d: 'M12 20v2' } },
    { tag: 'path', attrs: { d: 'm4.93 4.93 1.41 1.41' } },
    { tag: 'path', attrs: { d: 'm17.66 17.66 1.41 1.41' } },
    { tag: 'path', attrs: { d: 'M2 12h2' } },
    { tag: 'path', attrs: { d: 'M20 12h2' } },
    { tag: 'path', attrs: { d: 'm6.34 17.66-1.41 1.41' } },
    { tag: 'path', attrs: { d: 'm19.07 4.93-1.41 1.41' } },
  ],
  moon: [
    {
      tag: 'path',
      attrs: {
        d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
      },
    },
  ],
  'arrow-left': [
    { tag: 'path', attrs: { d: 'm12 19-7-7 7-7' } },
    { tag: 'path', attrs: { d: 'M19 12H5' } },
  ],
  paperclip: [
    {
      tag: 'path',
      attrs: {
        d: 'm16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551',
      },
    },
  ],
  'external-link': [
    { tag: 'path', attrs: { d: 'M15 3h6v6' } },
    { tag: 'path', attrs: { d: 'M10 14 21 3' } },
    { tag: 'path', attrs: { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' } },
  ],
  'file-text': [
    {
      tag: 'path',
      attrs: {
        d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
      },
    },
    { tag: 'path', attrs: { d: 'M14 2v5a1 1 0 0 0 1 1h5' } },
    { tag: 'path', attrs: { d: 'M10 9H8' } },
    { tag: 'path', attrs: { d: 'M16 13H8' } },
    { tag: 'path', attrs: { d: 'M16 17H8' } },
  ],
  'book-open': [
    { tag: 'path', attrs: { d: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z' } },
    { tag: 'path', attrs: { d: 'M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z' } },
    { tag: 'path', attrs: { d: 'M6 8h2' } },
    { tag: 'path', attrs: { d: 'M6 12h2' } },
    { tag: 'path', attrs: { d: 'M16 8h2' } },
    { tag: 'path', attrs: { d: 'M16 12h2' } },
  ],
  sparkles: [
    {
      tag: 'path',
      attrs: {
        d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
      },
    },
    { tag: 'path', attrs: { d: 'M20 2v4' } },
    { tag: 'path', attrs: { d: 'M22 4h-4' } },
    { tag: 'circle', attrs: { cx: '4', cy: '20', r: '2' } },
  ],
  shuffle: [
    { tag: 'path', attrs: { d: 'm18 14 4 4-4 4' } },
    { tag: 'path', attrs: { d: 'm18 2 4 4-4 4' } },
    { tag: 'path', attrs: { d: 'M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22' } },
    { tag: 'path', attrs: { d: 'M2 6h1.972a4 4 0 0 1 3.6 2.2' } },
    { tag: 'path', attrs: { d: 'M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45' } },
  ],
  shield: [
    {
      tag: 'path',
      attrs: {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    },
  ],
  'shield-check': [
    {
      tag: 'path',
      attrs: {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    },
    { tag: 'path', attrs: { d: 'm9 12 2 2 4-4' } },
  ],
  'shield-cog': [
    {
      tag: 'path',
      attrs: {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '2.5' } },
    { tag: 'path', attrs: { d: 'M12 7.5v2' } },
    { tag: 'path', attrs: { d: 'M12 14.5v2' } },
    { tag: 'path', attrs: { d: 'm8.8 8.8 1.4 1.4' } },
    { tag: 'path', attrs: { d: 'm13.8 13.8 1.4 1.4' } },
    { tag: 'path', attrs: { d: 'm15.2 8.8-1.4 1.4' } },
    { tag: 'path', attrs: { d: 'm10.2 13.8-1.4 1.4' } },
  ],
  'clock-shield': [
    {
      tag: 'path',
      attrs: {
        d: 'M20 11V6a1 1 0 0 0-1-1c-2 0-4.5-1.2-6.24-2.72a1.17 1.17 0 0 0-1.52 0C9.51 3.81 7 5 5 5a1 1 0 0 0-1 1v7c0 4.5 3 7 6.5 8.5',
      },
    },
    { tag: 'circle', attrs: { cx: '17', cy: '17', r: '5' } },
    { tag: 'polyline', attrs: { points: '17 14.5 17 17 18.8 18' } },
  ],
  menu: [
    { tag: 'line', attrs: { x1: '4', x2: '20', y1: '12', y2: '12' } },
    { tag: 'line', attrs: { x1: '4', x2: '20', y1: '6', y2: '6' } },
    { tag: 'line', attrs: { x1: '4', x2: '20', y1: '18', y2: '18' } },
  ],
  x: [
    { tag: 'path', attrs: { d: 'M18 6 6 18' } },
    { tag: 'path', attrs: { d: 'm6 6 12 12' } },
  ],
  'volume-2': [
    { tag: 'path', attrs: { d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' } },
    { tag: 'path', attrs: { d: 'M16 9a5 5 0 0 1 0 6' } },
    { tag: 'path', attrs: { d: 'M19.364 5.636a9 9 0 0 1 0 12.728' } },
  ],
  'volume-x': [
    { tag: 'path', attrs: { d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z' } },
    { tag: 'line', attrs: { x1: '22', x2: '16', y1: '9', y2: '15' } },
    { tag: 'line', attrs: { x1: '16', x2: '22', y1: '9', y2: '15' } },
  ],
  qr: [
    { tag: 'rect', attrs: { width: '6', height: '6', x: '3', y: '3', rx: '1' } },
    { tag: 'rect', attrs: { width: '6', height: '6', x: '15', y: '3', rx: '1' } },
    { tag: 'rect', attrs: { width: '6', height: '6', x: '3', y: '15', rx: '1' } },
    { tag: 'path', attrs: { d: 'M15 15h3v3' } },
    { tag: 'path', attrs: { d: 'M18 21h3v-3' } },
    { tag: 'path', attrs: { d: 'M15 19v2' } },
    { tag: 'path', attrs: { d: 'M12 3v6' } },
    { tag: 'path', attrs: { d: 'M3 12h9' } },
    { tag: 'path', attrs: { d: 'M12 15v6' } },
  ],
  'layout-dashboard': [
    { tag: 'rect', attrs: { width: '7', height: '9', x: '3', y: '3', rx: '1' } },
    { tag: 'rect', attrs: { width: '7', height: '5', x: '14', y: '3', rx: '1' } },
    { tag: 'rect', attrs: { width: '7', height: '9', x: '14', y: '12', rx: '1' } },
    { tag: 'rect', attrs: { width: '7', height: '5', x: '3', y: '16', rx: '1' } },
  ],
  sliders: [
    { tag: 'line', attrs: { x1: '4', x2: '4', y1: '21', y2: '14' } },
    { tag: 'line', attrs: { x1: '4', x2: '4', y1: '10', y2: '3' } },
    { tag: 'line', attrs: { x1: '12', x2: '12', y1: '21', y2: '12' } },
    { tag: 'line', attrs: { x1: '12', x2: '12', y1: '8', y2: '3' } },
    { tag: 'line', attrs: { x1: '20', x2: '20', y1: '21', y2: '16' } },
    { tag: 'line', attrs: { x1: '20', x2: '20', y1: '12', y2: '3' } },
    { tag: 'circle', attrs: { cx: '4', cy: '12', r: '2' } },
    { tag: 'circle', attrs: { cx: '12', cy: '10', r: '2' } },
    { tag: 'circle', attrs: { cx: '20', cy: '14', r: '2' } },
  ],
  server: [
    { tag: 'rect', attrs: { width: '20', height: '8', x: '2', y: '2', rx: '2', ry: '2' } },
    { tag: 'rect', attrs: { width: '20', height: '8', x: '2', y: '14', rx: '2', ry: '2' } },
    { tag: 'line', attrs: { x1: '6', x2: '6.01', y1: '6', y2: '6' } },
    { tag: 'line', attrs: { x1: '10', x2: '18', y1: '6', y2: '6' } },
    { tag: 'line', attrs: { x1: '6', x2: '6.01', y1: '18', y2: '18' } },
    { tag: 'line', attrs: { x1: '10', x2: '18', y1: '18', y2: '18' } },
  ],
  globe: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
    { tag: 'path', attrs: { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' } },
    { tag: 'path', attrs: { d: 'M2 12h20' } },
  ],
  'globe-plus': [
    { tag: 'path', attrs: { d: 'M12 22a10 10 0 1 1 9.54-13' } },
    { tag: 'path', attrs: { d: 'M2 12h14' } },
    { tag: 'path', attrs: { d: 'M12 2a14.5 14.5 0 0 0 0 20' } },
    { tag: 'path', attrs: { d: 'M12 2a14.5 14.5 0 0 1 3.6 6' } },
    { tag: 'path', attrs: { d: 'M19 16v6' } },
    { tag: 'path', attrs: { d: 'M16 19h6' } },
  ],
  key: [
    { tag: 'circle', attrs: { cx: '7.5', cy: '7.5', r: '4.5' } },
    { tag: 'path', attrs: { d: 'm21 2-9.6 9.6' } },
    { tag: 'path', attrs: { d: 'm15.5 7.5 3 3' } },
  ],
  lock: [
    { tag: 'rect', attrs: { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' } },
    { tag: 'path', attrs: { d: 'M7 11V7a5 5 0 0 1 10 0v4' } },
    { tag: 'path', attrs: { d: 'M12 15v2' } },
  ],
  unlock: [
    { tag: 'rect', attrs: { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' } },
    { tag: 'path', attrs: { d: 'M7 11V7a5 5 0 0 1 9.9-1' } },
    { tag: 'path', attrs: { d: 'M12 15v2' } },
  ],
  'log-out': [
    { tag: 'path', attrs: { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' } },
    { tag: 'polyline', attrs: { points: '16 17 21 12 16 7' } },
    { tag: 'line', attrs: { x1: '21', x2: '9', y1: '12', y2: '12' } },
  ],
  'badge-check': [
    {
      tag: 'path',
      attrs: {
        d: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z',
      },
    },
    { tag: 'path', attrs: { d: 'm9 12 2 2 4-4' } },
  ],
  'code-2': [
    { tag: 'path', attrs: { d: 'm18 16 4-4-4-4' } },
    { tag: 'path', attrs: { d: 'm6 8-4 4 4 4' } },
    { tag: 'path', attrs: { d: 'm14.5 4-5 16' } },
  ],
  'scan-code': [
    { tag: 'path', attrs: { d: 'M3 7V5a2 2 0 0 1 2-2h2' } },
    { tag: 'path', attrs: { d: 'M17 3h2a2 2 0 0 1 2 2v2' } },
    { tag: 'path', attrs: { d: 'M21 17v2a2 2 0 0 1-2 2h-2' } },
    { tag: 'path', attrs: { d: 'M7 21H5a2 2 0 0 1-2-2v-2' } },
    { tag: 'path', attrs: { d: 'M7 12h2' } },
    { tag: 'path', attrs: { d: 'M11 12h2' } },
    { tag: 'path', attrs: { d: 'm15 10.5 1.5 1.5 2.5-3' } },
  ],
  'alert-triangle': [
    { tag: 'path', attrs: { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' } },
    { tag: 'line', attrs: { x1: '12', x2: '12', y1: '9', y2: '13' } },
    { tag: 'line', attrs: { x1: '12', x2: '12.01', y1: '17', y2: '17' } },
  ],
  mail: [
    { tag: 'rect', attrs: { width: '20', height: '16', x: '2', y: '4', rx: '2' } },
    { tag: 'path', attrs: { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' } },
  ],
  'brand-mail': [
    { tag: 'path', attrs: { d: 'M22 13v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9' } },
    { tag: 'path', attrs: { d: 'm2 8 8.97 5.7a1.94 1.94 0 0 0 2.06 0L16 11.8' } },
    { tag: 'path', attrs: { d: 'm19.5 2-2.5 4h4L18.5 10' } },
  ],
  'mail-open': [
    {
      tag: 'path',
      attrs: {
        d: 'M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z',
      },
    },
    { tag: 'path', attrs: { d: 'm22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10' } },
  ],
  'mail-plus': [
    { tag: 'path', attrs: { d: 'M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8' } },
    { tag: 'path', attrs: { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' } },
    { tag: 'path', attrs: { d: 'M19 16v6' } },
    { tag: 'path', attrs: { d: 'M16 19h6' } },
  ],
  mails: [
    { tag: 'rect', attrs: { width: '16', height: '12', x: '6', y: '4', rx: '2' } },
    { tag: 'path', attrs: { d: 'm6 7 6.9 4.3a1.94 1.94 0 0 0 2.2 0L22 7' } },
    { tag: 'path', attrs: { d: 'M2 8v10a2 2 0 0 0 2 2h14' } },
  ],
  inbox: [
    { tag: 'polyline', attrs: { points: '22 12 16 12 14 15 10 15 8 12 2 12' } },
    {
      tag: 'path',
      attrs: {
        d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
      },
    },
  ],
  clock: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
    { tag: 'polyline', attrs: { points: '12 6 12 12 16 14' } },
  ],
  'calendar-range': [
    { tag: 'rect', attrs: { width: '18', height: '18', x: '3', y: '4', rx: '2' } },
    { tag: 'line', attrs: { x1: '16', x2: '16', y1: '2', y2: '6' } },
    { tag: 'line', attrs: { x1: '8', x2: '8', y1: '2', y2: '6' } },
    { tag: 'line', attrs: { x1: '3', x2: '21', y1: '10', y2: '10' } },
    { tag: 'path', attrs: { d: 'M8 14h8' } },
    { tag: 'path', attrs: { d: 'M8 18h5' } },
  ],
  'trending-up': [
    { tag: 'polyline', attrs: { points: '22 7 13.5 15.5 8.5 10.5 2 17' } },
    { tag: 'polyline', attrs: { points: '16 7 22 7 22 13' } },
  ],
  activity: [
    {
      tag: 'path',
      attrs: {
        d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
      },
    },
  ],
}

const shapes = computed(() => ICONS[props.name])
</script>

<template>
  <svg
    class="app-icon"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <component :is="shape.tag" v-for="(shape, index) in shapes" :key="index" v-bind="shape.attrs" />
  </svg>
</template>
