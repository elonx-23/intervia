import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })

try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.setViewport({ width: 390, height: 844 })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await page.screenshot({ path: 'scripts/out-login-mobile.png' })
  console.log('HTML root:', await page.evaluate(() => document.getElementById('root')?.innerHTML?.slice(0, 500)))
  console.log('Erreurs console :')
  console.log(errors)
} finally {
  await browser.close()
}
