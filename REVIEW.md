# TMail UX & AX Review Checklist

Every pull request or major visual change must be validated against this checklist before merging.

## 1. Visual & Viewport Verification
Capture full-page screenshots across all three standard viewports plus reflow:
- [ ] **Desktop (1440×900)**: No horizontal overflow; address rail displays standard recipient address (`demo.user@example.com`) on a single line.
- [ ] **Tablet (768×1024)**: Responsive header collapses navigation cleanly into hamburger menu; reader modal/panel scales naturally.
- [ ] **Mobile (375×812)**: Single-column flow; touch targets are at least 44×44px; card headers do not wrap titles into awkward multi-line fragments.
- [ ] **Reflow (320px width)**: Zero horizontal scrollbars; header retains single-line brand and action layout; skip-link does not overlap interactive elements when unfocused.
- [ ] **Themes**: Both Light (`#f6f8fc`) and Dark (`#131314`) themes exhibit legible contrast (minimum 4.5:1 for body copy).
- [ ] **Languages**: English and Vietnamese layouts both render without text truncation or broken flex wrappers.

## 2. AX & Machine Discovery Surface Checks
Run the discovery surface scanner against the running site:
```bash
node /home/arcrek/.gemini/config/skills/ak-enhance-ux-ax/scripts/check-discovery-surfaces.mjs <base-url>
```
Verification requirements:
- [ ] **`robots.txt`**: Serves status 200 `text/plain`, contains absolute `Sitemap:`, allows search and user AI bots, disallows `/admin` and sandboxes.
- [ ] **`sitemap.xml`**: Serves valid XML listing canonical public pages with accurate `<lastmod>`.
- [ ] **Metadata**: Valid `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph tags (`og:title`, `og:image`, `og:url`), and Twitter cards.
- [ ] **OG Image**: Absolute URL to a fetchable 1200×630 PNG/JPG image with status 200.
- [ ] **Structured Data**: Valid JSON-LD graph defining `WebApplication` and `Organization`.
- [ ] **Semantic Shell**: Initial server HTML contains >200 characters of meaningful semantic headings and body copy before client-side JS executes.
- [ ] **Markdown Twins**: `/index.md` (and `Accept: text/markdown` negotiation on `/`) serves complete markdown with `Vary: Accept` and `X-Robots-Tag: noindex`.
- [ ] **`/llms.txt` & `/llms-full.txt`**: Served with `X-Robots-Tag: noindex` conforming to llmstxt.org.

## 3. Accessibility & Motion
- [ ] **Keyboard Navigation**: All interactive elements (inputs, copy buttons, modals, tabs) are reachable via Tab and have visible `:focus-visible` rings (`outline: 3px solid var(--primary)`).
- [ ] **Screen Readers**: Skeletons and icons have `.sr-only` descriptions or `aria-hidden="true"`.
- [ ] **Reduced Motion**: Respects `prefers-reduced-motion: reduce` by disabling transitions and animations globally.
- [ ] **Security Sandbox**: Email HTML message rendering remains strictly sandboxed inside the nonce'd iframe via `postMessage`.

## 4. Test Suite Pass
- [ ] Backend tests pass: `.venv/bin/pytest`
- [ ] Frontend tests pass: `npm test` inside `frontend/`
- [ ] Production build succeeds: `npm run build` inside `frontend/`
