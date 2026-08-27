const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const bannerIdx = html.indexOf('id="global-update-alert"');
console.log(html.substring(bannerIdx, bannerIdx + 600));
