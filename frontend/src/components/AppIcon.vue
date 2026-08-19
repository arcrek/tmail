<script setup lang="ts">
/**
 * Inline Lucide-derived 24x24 stroke icons (ISC-licensed path data, no runtime dependency).
 * Add new names to IconName + ICONS together; each shape is rendered as its own SVG tag so
 * we avoid v-html (works reliably across the jsdom test environment and real browsers alike).
 */
import { computed } from 'vue'

export type IconName =
  | 'copy'
  | 'check'
  | 'refresh-cw'
  | 'plus'
  | 'trash-2'
  | 'download'
  | 'bell'
  | 'sun'
  | 'moon'
  | 'arrow-left'
  | 'paperclip'
  | 'external-link'
  | 'file-text'
  | 'sparkles'
  | 'shield'
  | 'menu'
  | 'x'
  | 'volume-2'
  | 'volume-x'
  | 'qr'
type Shape = { tag: 'path' | 'circle' | 'rect' | 'line' | 'polyline'; attrs: Record<string, string> }

const props = defineProps<{ name: IconName }>()

const ICONS: Record<IconName, Shape[]> = {
  copy: [
    { tag: 'rect', attrs: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' } },
    { tag: 'path', attrs: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' } },
  ],
  check: [
    { tag: 'path', attrs: { d: 'M20 6 9 17l-5-5' } },
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
  bell: [
    { tag: 'path', attrs: { d: 'M10.268 21a2 2 0 0 0 3.464 0' } },
    {
      tag: 'path',
      attrs: {
        d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
      },
    },
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
  shield: [
    {
      tag: 'path',
      attrs: {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    },
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
    { tag: 'rect', attrs: { width: '5', height: '5', x: '3', y: '3', rx: '1' } },
    { tag: 'rect', attrs: { width: '5', height: '5', x: '16', y: '3', rx: '1' } },
    { tag: 'rect', attrs: { width: '5', height: '5', x: '3', y: '16', rx: '1' } },
    { tag: 'path', attrs: { d: 'M21 16h-3a2 2 0 0 0-2 2v3' } },
    { tag: 'path', attrs: { d: 'M21 21v.01' } },
    { tag: 'path', attrs: { d: 'M12 7v3a2 2 0 0 1-2 2H7' } },
    { tag: 'path', attrs: { d: 'M3 12h.01' } },
    { tag: 'path', attrs: { d: 'M12 3h.01' } },
    { tag: 'path', attrs: { d: 'M12 16v.01' } },
    { tag: 'path', attrs: { d: 'M16 12h1' } },
    { tag: 'path', attrs: { d: 'M21 12v.01' } },
    { tag: 'path', attrs: { d: 'M12 21v-1' } },
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
