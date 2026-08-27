const https = require('https');
const http = require('http');

const mediafireUrl = 'https://www.mediafire.com/file/ai4tgfft0btdsym/Loord_v10.6.0%2529.iso/file';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
  });
}

async function test() {
  console.log('Fetching mediafire page...');
  const res = await fetchUrl(mediafireUrl);
  console.log('Status code:', res.statusCode);
  
  // Procura links de download
  const matches = [
    ...res.body.matchAll(/href="([^"]+download[^"]+mediafire[^"]*)"/gi),
    ...res.body.matchAll(/href="([^"]+\.iso[^"]*)"/gi),
    ...res.body.matchAll(/aria-label="Download file"[^>]*href="([^"]+)"/gi),
    ...res.body.matchAll(/id="downloadButton"[^>]*href="([^"]+)"/gi)
  ];
  
  console.log('Found matches:');
  for (const m of matches) {
    console.log('Match:', m[1]);
  }
}

test().catch(console.error);
