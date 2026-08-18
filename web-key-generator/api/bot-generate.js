const { generateActivationKey, getLicenses, saveLicenses } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bot-Api-Key');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ success: false, error: 'Method Not Allowed' }); return; }

  const apiKey = req.headers['x-bot-api-key'];
  const expectedKey = process.env.BOT_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    res.status(401).json({ success: false, error: 'Nao autorizado.' });
    return;
  }

  try {
    let body = req.body;
    if (!body || typeof body !== 'object') {
      body = await new Promise((resolve) => {
        let raw = '';
        req.on('data', c => raw += c);
        req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
      });
    }

    const { uuid, clientName, licenseType, durationDays } = body;

    if (!uuid || !uuid.trim()) {
      res.status(400).json({ success: false, error: 'UUID e obrigatorio.' });
      return;
    }

    const cleanUuid = uuid.trim().toLowerCase();
    const cleanName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente Bot';
    const key = generateActivationKey(cleanUuid);
    const licenses = await getLicenses();

    let resolvedType = 'temporary';
    let hours = null;

    if (licenseType === 'permanent-unlimited') {
      resolvedType = 'permanent-unlimited';
    } else if (licenseType === 'permanent-single') {
      resolvedType = 'permanent-single';
    } else {
      resolvedType = 'temporary';
      const dias = Math.max(1, parseInt(durationDays || '1', 10));
      hours = dias * 24;
    }

    const newLicense = {
      uuid: cleanUuid,
      key,
      clientName: cleanName,
      licenseType: resolvedType,
      activationMode: resolvedType === 'permanent-single' ? 'single' : 'unlimited',
      durationHours: hours,
      durationDays: hours ? Math.round(hours / 24) : null,
      expiresAt: null,
      createdBy: 'bot-discord',
      createdAt: Date.now(),
      status: 'pending',
      activatedAt: null,
      activatedIp: null
    };

    const index = licenses.findIndex(l => l.uuid && l.uuid.toLowerCase() === cleanUuid);
    if (index !== -1) { licenses[index] = newLicense; } else { licenses.push(newLicense); }
    await saveLicenses(licenses);

    res.status(200).json({
      success: true,
      uuid: cleanUuid,
      key,
      clientName: cleanName,
      licenseType: resolvedType,
      durationDays: newLicense.durationDays
    });
  } catch (e) {
    console.error('[BOT_GENERATE_ERROR]', e);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};
