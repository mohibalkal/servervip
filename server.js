const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/extract', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  let browser;
  try {
    console.log('Launching browser...');
    
    browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ],
      headless: "new"
    });
    
    console.log('Browser launched successfully');
    const page = await browser.newPage();
    console.log('New page created');
    
    // Set longer timeout for navigation
    await page.setDefaultNavigationTimeout(60000); // 60 seconds
    await page.setDefaultTimeout(60000); // 60 seconds for other operations
    
    // Enable request interception
    await page.setRequestInterception(true);
    
    // Optimize page load
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Block unnecessary resources
      if (['image', 'stylesheet', 'font'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    let videoLinks = [];
    
    // Monitor console logs
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('.m3u8') || text.includes('.ts')) {
        videoLinks.push(text);
        console.log('Found video link in console:', text);
      }
    });

    // Monitor all requests (including Fetch/XHR)
    page.on('request', request => {
      const reqUrl = request.url();
      if (reqUrl.includes('.m3u8') || reqUrl.includes('.ts')) {
        videoLinks.push(reqUrl);
        console.log('Found video link in request:', reqUrl);
      }
    });

    try {
      console.log('Navigating to URL:', url);
      // Navigate to the page with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 60000
          });
          console.log('Navigation successful');
          break; // If successful, exit the retry loop
        } catch (navigationError) {
          retryCount++;
          console.log(`Navigation attempt ${retryCount} failed:`, navigationError.message);
          
          if (retryCount === maxRetries) {
            throw navigationError; // Re-throw if all retries failed
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      // Wait for any potential video links to load
      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log('Found video links:', videoLinks);
      // Return the results
      res.json({
        success: true,
        videoLinks: [...new Set(videoLinks)] // Remove duplicates
      });
    } catch (navigationError) {
      console.error('Navigation error:', navigationError);
      res.status(504).json({
        error: 'Navigation failed after retries',
        details: navigationError.message
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed successfully');
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
});

// Add a health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
