const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const mediafirePage = 'https://www.mediafire.com/file/ai4tgfft0btdsym/Loord_v10.6.0%2529.iso/file';

function resolveMediafireDirectUrl(pageUrl) {
  return new Promise((resolve, reject) => {
    https.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(resolveMediafireDirectUrl(res.headers.location));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const m = body.match(/href="([^"]*download[0-9]*\.mediafire\.com\/[^"]+)"/i) ||
                  body.match(/aria-label="Download file"[^>]*href="([^"]+)"/i) ||
                  body.match(/id="downloadButton"[^>]*href="([^"]+)"/i) ||
                  body.match(/href="([^"]+\.iso[^"]*)"/i);
        if (m && m[1]) {
          resolve(m[1]);
        } else {
          resolve(null);
        }
      });
    }).on('error', (err) => resolve(null));
  });
}

function streamDownloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return streamDownloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        return reject(new Error(`Servidor retornou HTTP ${res.statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const pct = Math.round((downloadedBytes / totalBytes) * 100);
          const dlMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
          const totMB = (totalBytes / (1024 * 1024)).toFixed(1);
          onProgress(pct, `Baixando ISO Oficial Loord Lite v10.6 (${dlMB} MB de ${totMB} MB)...`);
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve(destPath));
      });

      fileStream.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Tempo limite de conexão esgotado ao baixar a ISO.'));
    });
  });
}

async function run() {
  console.log('Resolvendo URL do Mediafire...');
  const directUrl = await resolveMediafireDirectUrl(mediafirePage);
  console.log('Direct URL:', directUrl);
  if (!directUrl) throw new Error('Não foi possível obter o link do Mediafire');

  const testDest = path.join(os.tmpdir(), 'test_loord_sample.dat');
  console.log('Iniciando stream para:', testDest);
  
  // Testa primeiros 5 segundos
  let count = 0;
  await new Promise((resolve, reject) => {
    const parsed = new URL(directUrl);
    https.get(directUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Range': 'bytes=0-10485760' // 10MB test
      }
    }, (res) => {
      console.log('Download test HTTP status:', res.statusCode, 'Content-Length:', res.headers['content-length']);
      res.on('data', chunk => {
        count += chunk.length;
        if (count >= 1000000) {
          console.log(`Recebidos ${(count/1024/1024).toFixed(2)} MB com sucesso!`);
          res.destroy();
          resolve();
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });

  console.log('TESTE CONCLUIDO COM SUCESSO!');
}

run().catch(console.error);
