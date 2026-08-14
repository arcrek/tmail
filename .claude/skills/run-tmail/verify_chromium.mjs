import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--no-sandbox'] })
console.log('chromium OK:', browser.version())
await browser.close()
