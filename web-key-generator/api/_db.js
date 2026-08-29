const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const localDbPath = path.join(os.tmpdir(), 'ffopt_users.json');
const localLicensesPath = path.join(os.tmpdir(), 'ffopt_licenses.json');
const defaultSalt = 'FFOptimizerDbSalt2026';
const sessionSecret = 'SecretSessionKey2026_LiveAuth_8h_ForceLogout_GlobalReset_v5';
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

const localApprovalsPath = path.join(os.tmpdir(), 'ffopt_approvals.json');

async function getApprovals() {
  const kvData = await kvGet('approvals');
  if (Array.isArray(kvData)) {
    return kvData;
  }

  if (fs.existsSync(localApprovalsPath)) {
    try {
      return JSON.parse(fs.readFileSync(localApprovalsPath, 'utf8'));
    } catch (e) {
      console.error('Error reading local approvals file:', e);
    }
  }

  return [];
}

async function saveApprovals(approvals) {
  await kvSet('approvals', approvals);
  try {
    fs.writeFileSync(localApprovalsPath, JSON.stringify(approvals, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing local approvals file:', e);
    return false;
  }
}

function getUserRole(user) {
  if (!user) return 'vendedor';
  const uname = (user.username || '').trim().toLowerCase();
  if (uname === 'gabriel') return 'worn';
  if (user.role === 'worn' || user.role === 'owner') return 'worn';
  if (user.role === 'admin' || user.isAdmin === true) return 'admin';
  return 'vendedor';
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
        role: 'worn',
        createdBy: 'Master Worn',
        createdAt: Date.now()
      }
    ];
    await saveUsers(users);
  } else {
    // Ensure master admin gabriel always has the updated password 168096 and role worn
    const gIndex = users.findIndex(u => u.username.toLowerCase() === 'gabriel');
    if (gIndex !== -1) {
      let changed = false;
      if (users[gIndex].passwordHash !== masterHash) {
        users[gIndex].passwordHash = masterHash;
        changed = true;
      }
      if (users[gIndex].role !== 'worn' || !users[gIndex].isAdmin) {
        users[gIndex].role = 'worn';
        users[gIndex].isAdmin = true;
        changed = true;
      }
      if (changed) await saveUsers(users);
    } else {
      users.unshift({
        username: 'gabriel',
        passwordHash: masterHash,
        isAdmin: true,
        role: 'worn',
        createdBy: 'Master Worn',
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

function createSessionToken(username, isAdmin, role) {
  const resolvedRole = role || (username.toLowerCase() === 'gabriel' ? 'worn' : (isAdmin ? 'admin' : 'vendedor'));
  const expiry = Date.now() + 8 * 60 * 60 * 1000; // Validade rigorosa de 8 horas (após isso, desloga)
  const payload = JSON.stringify({ username, isAdmin: resolvedRole === 'worn' || resolvedRole === 'owner' || !!isAdmin, role: resolvedRole, expiry });
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

function verifySessionToken(token) {
  try {
    const { payload, signature } = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
    if (signature !== expectedSignature) return null;
    
    const { username, isAdmin, role, expiry } = JSON.parse(payload);
    // Token expira rigorosamente após 8 horas
    if (!expiry || Date.now() > expiry) return null;
    
    const resolvedRole = role || (username.toLowerCase() === 'gabriel' ? 'worn' : (isAdmin ? 'admin' : 'vendedor'));
    return { username, isAdmin: resolvedRole === 'worn' || resolvedRole === 'owner' || !!isAdmin, role: resolvedRole, expiry };
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

  // ─────────────────────────────────────────────────────────────────
  // VALIDAÇÃO EM TEMPO REAL NO BANCO DE DADOS:
  // Se o usuário foi rebaixado de cargo (ex: admin para vendedor)
  // ou inativado/excluído, a mudança é aplicada NA MESMA HORA!
  // ─────────────────────────────────────────────────────────────────
  try {
    const users = await getOrInitUsers();
    const cleanUsername = sessionUser.username.trim().toLowerCase();
    const dbUser = users.find(u => u.username && u.username.trim().toLowerCase() === cleanUsername);

    // Se o usuário foi excluído, inativado ou aguarda aprovação, desloga e bloqueia imediatamente
    if (!dbUser || dbUser.status === 'inactive' || dbUser.status === 'pending_approval') {
      return null;
    }

    const currentRole = getUserRole(dbUser);
    const currentIsAdmin = (currentRole === 'worn' || currentRole === 'owner' || currentRole === 'admin');

    return {
      username: dbUser.username,
      role: currentRole,
      isAdmin: currentIsAdmin,
      status: dbUser.status || 'active',
      allowedPlans: Array.isArray(dbUser.allowedPlans) ? dbUser.allowedPlans : [],
      directPlans: Array.isArray(dbUser.directPlans) ? dbUser.directPlans : [],
      allPlansDirect: !!dbUser.allPlansDirect,
      freeDailyLimit: dbUser.freeDailyLimit !== undefined ? dbUser.freeDailyLimit : 5,
      freeUsageToday: dbUser.freeUsageToday || null
    };
  } catch (e) {
    console.error('Erro na validação em tempo real de sessão:', e);
    return sessionUser;
  }
}

const localPlansPath = path.join(os.tmpdir(), 'ffopt_plans.json');
const localPaymentsPath = path.join(os.tmpdir(), 'ffopt_payments.json');

const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || 'APP_USR-5617886944307807-020702-33b4180bff7647db4c9c46b73c7132ec-241788776';
const MP_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY || 'APP_USR-6a6c9dc0-0eeb-48ec-89c5-a513a3194445';

const defaultPlans = [
  { id: 'temp-1h', name: '⏳ Temporária - 1 Hora (Teste Rápido)', type: 'temporary', durationHours: 1, price: 0.00, isFree: true, enabled: true },
  { id: 'temp-2h', name: '⏳ Temporária - 2 Horas', type: 'temporary', durationHours: 2, price: 0.00, isFree: true, enabled: true },
  { id: 'temp-6h', name: '⏳ Temporária - 6 Horas', type: 'temporary', durationHours: 6, price: 5.00, isFree: false, enabled: true },
  { id: 'temp-12h', name: '⏳ Temporária - 12 Horas', type: 'temporary', durationHours: 12, price: 10.00, isFree: false, enabled: true },
  { id: 'temp-24h', name: '⏳ Temporária - 24 Horas (1 Dia)', type: 'temporary', durationHours: 24, price: 15.00, isFree: false, enabled: true },
  { id: 'temp-7d', name: '⏳ Temporária - 7 Dias (Semanal)', type: 'temporary', durationHours: 7 * 24, price: 25.00, isFree: false, enabled: true },
  { id: 'temp-15d', name: '⏳ Temporária - 15 Dias (Quinzenal)', type: 'temporary', durationHours: 15 * 24, price: 35.00, isFree: false, enabled: true },
  { id: 'temp-30d', name: '⏳ Temporária - 30 Dias (Mensal)', type: 'temporary', durationHours: 30 * 24, price: 45.00, isFree: false, enabled: true },
  { id: 'permanent-single', name: '👑 Vitalícia - 1 Ativação Única (Chave Descartável pós-uso)', type: 'permanent-single', durationHours: null, price: 47.99, isFree: false, enabled: true },
  { id: 'permanent-unlimited', name: '👑 Vitalícia - Reativação Ilimitada no Mesmo PC (UUID Vinculado)', type: 'permanent-unlimited', durationHours: null, price: 60.00, isFree: false, enabled: true },
  { id: 'temp-custom-hours', name: '⏳ Temporária - Personalizada (em Horas)', type: 'temporary', durationHours: null, price: 20.00, isFree: false, enabled: true },
  { id: 'temp-custom-days', name: '⏳ Temporária - Personalizada (em Dias)', type: 'temporary', durationHours: null, price: 50.00, isFree: false, enabled: true }
];

async function getPlans() {
  const kvData = await kvGet('plans');
  if (Array.isArray(kvData) && kvData.length > 0) {
    // Merge any missing default plans
    const existingIds = new Set(kvData.map(p => p.id));
    const merged = [...kvData];
    for (const dp of defaultPlans) {
      if (!existingIds.has(dp.id)) {
        merged.push(dp);
      }
    }
    return merged;
  }

  if (fs.existsSync(localPlansPath)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(localPlansPath, 'utf8'));
      if (Array.isArray(fileData) && fileData.length > 0) return fileData;
    } catch (e) {}
  }

  return defaultPlans;
}

async function savePlans(plans) {
  await kvSet('plans', plans);
  try {
    fs.writeFileSync(localPlansPath, JSON.stringify(plans, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

async function getPayment(paymentId) {
  return await kvGet(`payment_${paymentId}`);
}

async function savePayment(paymentId, data) {
  return await kvSet(`payment_${paymentId}`, data);
}

const defaultIsoConfig = {
  isFree: false,
  plans: [
    { id: 'iso_1', name: '1 Formatação (1 Uso)', uses: 1, price: 50.00, enabled: true },
    { id: 'iso_2', name: '2 Formatações (2 Usos)', uses: 2, price: 70.00, enabled: true },
    { id: 'iso_3', name: '3 Formatações (3 Usos)', uses: 3, price: 100.00, enabled: true }
  ]
};
const localIsoConfigPath = path.join(os.tmpdir(), 'ffopt_iso_config.json');

async function getIsoConfig() {
  const kvData = await kvGet('iso_config');
  if (kvData && typeof kvData === 'object') {
    return {
      isFree: !!kvData.isFree,
      plans: Array.isArray(kvData.plans) && kvData.plans.length > 0 ? kvData.plans : defaultIsoConfig.plans
    };
  }
  if (fs.existsSync(localIsoConfigPath)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(localIsoConfigPath, 'utf8'));
      if (fileData && typeof fileData === 'object') return fileData;
    } catch (e) {}
  }
  return defaultIsoConfig;
}

async function saveIsoConfig(config) {
  await kvSet('iso_config', config);
  try {
    fs.writeFileSync(localIsoConfigPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  parseRequestBody,
  getOrInitUsers,
  saveUsers,
  getLicenses,
  saveLicenses,
  getApprovals,
  saveApprovals,
  getUserRole,
  getPlans,
  savePlans,
  getPayment,
  savePayment,
  defaultPlans,
  getIsoConfig,
  saveIsoConfig,
  defaultIsoConfig,
  MP_ACCESS_TOKEN,
  MP_PUBLIC_KEY,
  hashPassword,
  createSessionToken,
  generateActivationKey,
  verifyAuth,
  activationSalt
};
