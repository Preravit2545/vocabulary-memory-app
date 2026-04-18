import http from 'http';

// Fetch the page HTML
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

// Fetch a CSS/JS file
function fetchFile(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== Checking http://localhost:4200 ===\n');

  // 1. Fetch main page
  let page;
  try {
    page = await fetchPage('http://localhost:4200/review');
    console.log('Page status:', page.status);
    console.log('Page HTML length:', page.body.length);
    
    // Check for app-root
    console.log('Has <app-root>:', page.body.includes('<app-root'));
    
    // Find stylesheet links
    const styleLinks = [...page.body.matchAll(/href="([^"]*\.css[^"]*)"/g)].map(m => m[1]);
    console.log('Stylesheet links:', styleLinks);
    
    // Find script tags
    const scripts = [...page.body.matchAll(/src="([^"]*\.js[^"]*)"/g)].map(m => m[1]);
    console.log('Script tags:', scripts.slice(0, 5));
    
  } catch (e) {
    console.error('Failed to fetch page:', e.message);
    return;
  }

  // 2. Fetch styles.css
  try {
    const css = await fetchFile('http://localhost:4200/styles.css');
    console.log('\n=== styles.css ===');
    console.log('Status:', css.status);
    console.log('Size:', css.body.length, 'bytes');
    
    // Check for Tailwind classes
    const hasFlex = css.body.includes('.flex {') || css.body.includes('.flex{');
    const hasBgWhite = css.body.includes('.bg-white') || css.body.includes('bg-white');
    const hasTextBlue = css.body.includes('.text-blue') || css.body.includes('text-blue');
    const hasTailwindBase = css.body.includes('*, ::before, ::after') || css.body.includes('box-sizing: border-box');
    
    console.log('Has .flex:', hasFlex);
    console.log('Has .bg-white:', hasBgWhite);
    console.log('Has .text-blue:', hasTextBlue);
    console.log('Has Tailwind base (box-sizing):', hasTailwindBase);
    
    // Show first 500 chars
    console.log('\nFirst 500 chars of CSS:');
    console.log(css.body.substring(0, 500));
    
  } catch (e) {
    console.log('\nNo styles.css at root, trying to find it...');
    
    // Try to find CSS from page links
    const styleLinks = [...page.body.matchAll(/href="([^"]*\.css[^"]*)"/g)].map(m => m[1]);
    for (const link of styleLinks) {
      const url = link.startsWith('http') ? link : `http://localhost:4200${link.startsWith('/') ? '' : '/'}${link}`;
      try {
        const css = await fetchFile(url);
        console.log(`\nCSS at ${url}:`);
        console.log('Size:', css.body.length, 'bytes');
        console.log('Has .flex:', css.body.includes('.flex'));
        console.log('Has .bg-white:', css.body.includes('.bg-white'));
        console.log('First 300 chars:', css.body.substring(0, 300));
      } catch (e2) {
        console.log(`Failed to fetch ${url}:`, e2.message);
      }
    }
  }
}

main().catch(console.error);
