const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const localDbPath = path.join(os.tmpdir(), 'ffopt_users.json');
const localLicensesPath = path.join(os.tmpdir(), 'ffopt_licenses.json');
const defaultSalt = 'FFOptimizerDbSalt2026';
const sessionSecret = 'SecretSessionKey2026';
const activationSalt = 'FFOptimizerSecure2026';

async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch(e) { return {}; }
    }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function getKvConfig() {
  const url = process.env.KV_REST_API_URL || 
              process.env.STORAGE_REST_API_URL ||
              process.env.UPSTASH_REDIS_REST_URL ||
              process.env.KV_URL;
  const token = process.env.KV_REST_API_TOKEN || 
                process.env.STORAGE_REST_API_TOKEN ||
                process.env.UPSTASH_REDIS_REST_TOKEN;
  return (url && token) ? { url: url.replace(/\/+$/, ''), token } : null;
}

async function kvGet(key) {
  const config = getKvConfig();
  if (!config) return null;

  const serializedKey = String(key);
  try {
    const res = await fetch(`${config.url}/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(["GET", serializedKey])
    });
    const data = await res.json();
    if (data && data.result !== undefined && data.result !== null) {
      let val = data.result;
      while (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          val = parsed;
        } catch (e) {
          break;
        }
      }
      return val;
    }
  } catch (e) {
    console.error('Error fetching from Upstash KV:', e);
  }
  return null;
}

async function kvSet(key, value) {
  const config = getKvConfig();
  if (!config) return false;

  const serializedKey = String(key);
  const valStr = typeof value === 'string' ? value : JSON.stringify(value);

  try {
    const res = await fetch(`${config.url}/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(["SET", serializedKey, valStr])
    });
    const data = await res.json();
    return data && data.result === 'OK';
  } catch (e) {
    console.error('Error saving to Upstash KV:', e);
    return false;
  }
}

async function getUsers() {
  const kvData = await kvGet('users');
  if (Array.isArray(kvData) && kvData.length > 0) {
    return kvData;
  }

  if (fs.existsSync(localDbPath)) {
    try {
      return JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
    } catch (e) {
      console.error('Error reading local db file:', e);
    }
  }

  return [];
}

async function saveUsers(users) {
  await kvSet('users', users);

  try {
    fs.writeFileSync(localDbPath, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing local db file:', e);
    return false;
  }
}

async function getLicenses() {
  const kvData = await kvGet('licenses');
  if (Array.isArray(kvData)) {
    return kvData;
  }

  if (fs.existsSync(localLicensesPath)) {
    try {
      return JSON.parse(fs.readFileSync(localLicensesPath, 'utf8'));
    } catch (e) {
      console.error('Error reading local licenses file:', e);
    }
  }

  return [];
}

async function saveLicenses(licenses) {
  await kvSet('licenses', licenses);

  try {
    fs.writeFileSync(localLicensesPath, JSON.stringify(licenses, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing local licenses file:', e);
    return false;
  }
}

async function getOrInitUsers() {
  let users = await getUsers();
  const masterHash = crypto.pbkdf2Sync('168096', defaultSalt, 1000, 64, 'sha512').toString('hex');
  
  if (!users || users.length === 0) {
    users = [
      {
        username: 'gabriel',
        passwordHash: masterHash,
        isAdmin: true,
        createdBy: 'Master Admin',
        createdAt: Date.now()
      }
    ];
    await saveUsers(users);
  } else {
    // Ensure master admin gabriel always has the updated password 168096
    const gIndex = users.findIndex(u => u.username.toLowerCase() === 'gabriel');
    if (gIndex !== -1) {
      if (users[gIndex].passwordHash !== masterHash) {
        users[gIndex].passwordHash = masterHash;
        users[gIndex].isAdmin = true;
        await saveUsers(users);
      }
    } else {
      users.unshift({
        username: 'gabriel',
        passwordHash: masterHash,
        isAdmin: true,
        createdBy: 'Master Admin',
        createdAt: Date.now()
      });
      await saveUsers(users);
    }
  }
  return users;
}

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, defaultSalt, 1000, 64, 'sha512').toString('hex');
}

function createSessionToken(username, isAdmin) {
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = JSON.stringify({ username, isAdmin: !!isAdmin, expiry });
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

function verifySessionToken(token) {
  try {
    const { payload, signature } = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
    if (signature !== expectedSignature) return null;
    
    const { username, isAdmin, expiry } = JSON.parse(payload);
    if (Date.now() > expiry) return null;
    
    return { username, isAdmin: !!isAdmin };
  } catch (e) {
    return null;
  }
}

function generateActivationKey(uuid) {
  if (uuid && uuid.trim().length >= 5) {
    const hash = crypto.createHash('sha256').update(uuid.trim().toLowerCase() + activationSalt).digest('hex');
    const part1 = hash.substring(0, 4);
    const part2 = hash.substring(4, 8);
    const part3 = hash.substring(8, 12);
    const part4 = hash.substring(12, 16);
    return `${part1}-${part2}-${part3}-${part4}`.toUpperCase();
  } else {
    // Generate secure standalone license key
    const bytes = crypto.randomBytes(8).toString('hex').toUpperCase();
    return `LORD-${bytes.substring(0, 4)}-${bytes.substring(4, 8)}-${bytes.substring(8, 12)}`;
  }
}

async function verifyAuth(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  
  const sessionUser = verifySessionToken(token);
  if (!sessionUser) return null;

  return sessionUser;
}

module.exports = {
  parseRequestBody,
  getOrInitUsers,
  saveUsers,
  getLicenses,
  saveLicenses,
  hashPassword,
  createSessionToken,
  generateActivationKey,
  verifyAuth,
  activationSalt
};
