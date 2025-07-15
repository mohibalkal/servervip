const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

// Log environment information
console.log('Starting server with environment:', {
  NODE_ENV: process.env.NODE_ENV,
  PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
  PORT: process.env.PORT
});

const app = express();
app.use(cors());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

const PORT = process.env.PORT || 3000;

// Global browser instance
let browser;

// Initialize browser
async function initBrowser() {
  try {
    // Check if Chrome is installed
    try {
      await require('child_process').execSync('google-chrome --version');
      console.log('Chrome is installed');
    } catch (error) {
      console.log('Chrome is not installed, will use bundled Chromium');
    }

    const options = {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
      headless: "new"
    };

    // Only set executablePath if PUPPETEER_EXECUTABLE_PATH is explicitly set
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      console.log('Using Chrome at:', process.env.PUPPETEER_EXECUTABLE_PATH);
      options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      console.log('Using bundled Chromium');
    }

    console.log('Launching browser with config:', options);
    browser = await puppeteer.launch(options);
    console.log('Browser launched successfully');
    return true;
  } catch (error) {
    console.error('Failed to launch browser:', error);
    console.error('Error stack:', error.stack);
    return false;
  }
}

// Process error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  console.error('Stack trace:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing browser...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

app.get('/extract', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  let page;
  try {
    // Ensure browser is initialized
    if (!browser) {
      const success = await initBrowser();
      if (!success) {
        return res.status(500).json({ error: 'Failed to initialize browser' });
      }
    }

    page = await browser.newPage();
    console.log('New page created');
    
    // Set longer timeout for navigation
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);
    
    // Enable request interception
    await page.setRequestInterception(true);
    
    // Optimize page load
    page.on('request', (request) => {
      const resourceType = request.resourceType();
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

    // Monitor all requests
    page.on('request', request => {
      const reqUrl = request.url();
      if (reqUrl.includes('.m3u8') || reqUrl.includes('.ts')) {
        videoLinks.push(reqUrl);
        console.log('Found video link in request:', reqUrl);
      }
    });

    console.log('Navigating to URL:', url);
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 60000
        });
        console.log('Navigation successful');
        break;
      } catch (navigationError) {
        retryCount++;
        console.log(`Navigation attempt ${retryCount} failed:`, navigationError.message);
        
        if (retryCount === maxRetries) {
          throw navigationError;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Found video links:', videoLinks);
    res.json({
      success: true,
      videoLinks: [...new Set(videoLinks)]
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  } finally {
    if (page) {
      try {
        await page.close();
        console.log('Page closed successfully');
      } catch (closeError) {
        console.error('Error closing page:', closeError);
      }
    }
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    if (!browser) {
      const success = await initBrowser();
      if (!success) {
        return res.status(500).json({ status: 'unhealthy', error: 'Browser initialization failed' });
      }
    }
    res.status(200).json({ status: 'healthy' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Initialize browser before starting server
console.log('Starting server initialization...');
initBrowser().then((success) => {
  if (success) {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Server initialization complete');
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });
  } else {
    console.error('Failed to initialize browser, exiting...');
    process.exit(1);
  }
}).catch((err) => {
  console.error('Fatal error during initialization:', err);
  console.error('Stack trace:', err.stack);
  process.exit(1);
}); 
