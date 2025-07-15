const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/extract', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });
    const page = await browser.newPage();
    
    // مراقبة console.log في المتصفح
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('.m3u8') || text.includes('.ts')) {
        videoLinks.push(text);
        console.log('Found video link in console:', text);
      }
    });

    let videoLinks = [];
    
    // مراقبة جميع الطلبات (بما في ذلك Fetch/XHR)
    page.on('request', request => {
      const reqUrl = request.url();
      if (reqUrl.includes('.m3u8') || reqUrl.includes('.ts')) {
        videoLinks.push(reqUrl);
        console.log('Found video link:', reqUrl);
      }
    });

    // مراقبة استجابات الشبكة أيضاً
    page.on('response', response => {
      const resUrl = response.url();
      if (resUrl.includes('.m3u8') || resUrl.includes('.ts')) {
        videoLinks.push(resUrl);
        console.log('Found video response:', resUrl);
      }
    });

    // تفعيل مراقبة الشبكة
    await page.setRequestInterception(true);
    
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // انتظار أطول للفيديو
    await page.waitForTimeout(15000); // انتظر 15 ثانية
    
    // محاولة تشغيل الفيديو إذا كان هناك زر play
    try {
      await page.evaluate(() => {
        const playButton = document.querySelector('button[aria-label="Play"], .play-button, #play-button, .plyr__control--overlaid');
        if (playButton) {
          playButton.click();
        }
      });
      await page.waitForTimeout(5000); // انتظار إضافي بعد الضغط على play
    } catch (e) {
      console.log('No play button found or already playing');
    }

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