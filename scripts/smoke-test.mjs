import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CODE = process.argv[2]
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })

const routes = [
  '/',
  '/interventions',
  '/interventions/nouvelle',
  '/documents',
  '/devis/nouveau',
  '/statistiques',
  '/notifications',
  '/techniciens',
]

try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.setViewport({ width: 390, height: 844 })

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' })
  await page.type('#username', 'admin')
  await page.type('#code', CODE)
  await page.click('button[type=submit]')
  await new Promise((r) => setTimeout(r, 600))

  for (const route of routes) {
    await page.goto(`http://localhost:5173${route}`, { waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 400))
    const bodyLen = (await page.evaluate(() => document.body.innerText)).length
    console.log(`${route} -> bodyTextLen=${bodyLen}`)
  }

  console.log('pageErrors:', pageErrors)
} finally {
  await browser.close()
}
