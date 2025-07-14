const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/extract', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    let videoLinks = [];
    page.on('request', request => {
      const reqUrl = request.url();
      if (reqUrl.includes('.m3u8') || reqUrl.includes('.ts')) {
        videoLinks.push(reqUrl);
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(10000); // انتظر 10 ثواني ليبدأ الفيديو

    // إزالة التكرار
    videoLinks = [...new Set(videoLinks)];

    res.json({ links: videoLinks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/', (req, res) => {
  res.send('Puppeteer Video Link Extractor is running! Use /extract?url=...');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 