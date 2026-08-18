const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rawData = require('./regis/embedded_reg_data.js');

const SECRET_SALT = 'loord-optimizer-reg-key-shield-2026-v1';
const KEY = crypto.createHash('sha256').update(SECRET_SALT).digest();

const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
let enc = cipher.update(JSON.stringify(rawData), 'utf8', 'hex');
enc += cipher.final('hex');
const tag = cipher.getAuthTag().toString('hex');

const payload = {
  iv: iv.toString('hex'),
  tag: tag,
  data: enc
};

const code = `// Loord Optimizer Encrypted Registry Shield (AES-256-GCM)
const crypto = require('crypto');
const SECRET_SALT = '${SECRET_SALT}';
const KEY = crypto.createHash('sha256').update(SECRET_SALT).digest();
const PAYLOAD = ${JSON.stringify(payload, null, 2)};

function getDecryptedRegData() {
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(PAYLOAD.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(PAYLOAD.tag, 'hex'));
  let dec = decipher.update(PAYLOAD.data, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return JSON.parse(dec);
}

module.exports = getDecryptedRegData();
`;

fs.writeFileSync(path.join(__dirname, 'regis', 'encrypted_reg_data.js'), code, 'utf8');
console.log('Encrypted registry file written successfully to regis/encrypted_reg_data.js');
