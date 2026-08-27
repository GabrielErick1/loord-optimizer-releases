const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const mouseConfigIdx = html.indexOf('id="tab-mouse-config"');
console.log('tab-mouse-config index:', mouseConfigIdx);
console.log(html.substring(mouseConfigIdx - 100, mouseConfigIdx + 800));
