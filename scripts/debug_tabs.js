const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const regexTab = /id="tab-([^"]+)"/g;
let match;
const tabs = [];
while ((match = regexTab.exec(html)) !== null) {
  tabs.push(match[1]);
}
console.log('Tabs in HTML:', tabs);

const activeTabs = (html.match(/class="[^"]*tab-content[^"]*active[^"]*"/g) || []);
console.log('Active tab elements count:', activeTabs.length);

const navRegex = /data-tab="([^"]+)"/g;
const navs = [];
while ((match = navRegex.exec(html)) !== null) {
  navs.push(match[1]);
}
console.log('Navs in HTML:', navs);
