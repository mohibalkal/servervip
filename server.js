import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/extract', async (req, res) => {
  const { url } = req.query;
  console.log(`[${new Date().toISOString()}] Received request for URL: ${url}`);
  if (!url) {
    console.log('Request failed: Missing URL parameter.');
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath: puppeteer.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const videoLinks = new Set();

    page.on('response', response => {
      const resUrl = response.url();
      if (resUrl.includes('.m3u8') || resUrl.includes('.ts')) {
        console.log(`Found video link: ${resUrl}`);
        videoLinks.add(resUrl);
      }
    });

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('Page loaded. Waiting 10 seconds for dynamic content...');
    await page.waitForTimeout(10000);

    const finalLinks = Array.from(videoLinks);
    console.log(`Found ${finalLinks.length} unique links. Sending response.`);
    res.json({ links: finalLinks });

  } catch (err) {
    console.error('An error occurred during extraction:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
});

app.get('/', (req, res) => {
  res.send('Puppeteer Video Link Extractor is running! Use /extract?url=...');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
