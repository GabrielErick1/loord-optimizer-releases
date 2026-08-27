const https = require('https');
const pageUrl = 'https://www.mediafire.com/file/ai4tgfft0btdsym/Loord_v10.6.0%2529.iso/file';

https.get(pageUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const m = body.match(/aria-label="Download file"[^>]*href="([^"]+)"/i) ||
              body.match(/id="downloadButton"[^>]*href="([^"]+)"/i) ||
              body.match(/href="(https:\/\/[^"]*mediafire[^"]*\/[^"]+\.iso[^"]*)"/i) ||
              body.match(/href="(https:\/\/download[^"]+mediafire[^"]+)"/i);
    console.log('Mediafire Direct URL:', m ? m[1] : 'NOT FOUND');
  });
}).on('error', (e) => console.error('Error:', e.message));
