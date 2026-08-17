const { parseRequestBody, generateActivationKey, getLicenses, saveLicenses } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const { uuid, key } = await parseRequestBody(req);
    if (!uuid || !key) {
      res.status(400).json({ success: false, error: 'UUID e chave requeridos.' });
      return;
    }

    const cleanKey = key.trim().toUpperCase();
    const cleanUuid = uuid.trim().toLowerCase();
    const licenses = await getLicenses();
    const expectedCryptoKey = generateActivationKey(uuid);

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
    const cleanIp = ip.split(',')[0].trim();

    let license = licenses.find(l => l.key && l.key.toUpperCase() === cleanKey);

    if (!license) {
      if (cleanKey === expectedCryptoKey) {
        // Direct crypto key fallback
        license = {
          uuid: uuid.trim(),
          key: cleanKey,
          clientName: 'Cliente VIP',
          licenseType: 'permanent',
          durationDays: null,
          expiresAt: null,
          createdBy: 'Ativação Direta',
          createdAt: Date.now(),
          status: 'activated',
          activatedAt: Date.now(),
          activatedIp: cleanIp
        };
        licenses.push(license);
        await saveLicenses(licenses);

        res.status(200).json({
          success: true,
          clientName: 'Cliente VIP',
          licenseType: 'permanent',
          expiresAt: null
        });
        return;
      } else {
        res.status(400).json({ success: false, error: 'Chave inválida para esta máquina.' });
        return;
      }
    }

    if (license.status === 'revoked') {
      res.status(403).json({ success: false, error: 'Licença revogada pelo administrador!' });
      return;
    }

    // Verify machine match
    if (license.uuid && license.uuid.toLowerCase() !== cleanUuid) {
      res.status(403).json({ success: false, error: 'Chave vinculada a outro computador!' });
      return;
    }

    // Check expiration
    if (license.licenseType === 'temporary') {
      if (license.expiresAt && Date.now() > license.expiresAt) {
        res.status(403).json({ success: false, error: 'Licença temporária expirada!' });
        return;
      }
    }

    // Update IP & Auto-activate if pending
    license.activatedIp = cleanIp;
    if (license.status === 'pending') {
      license.status = 'activated';
      license.activatedAt = Date.now();
      if (license.licenseType === 'temporary' && !license.expiresAt) {
        const days = license.durationDays || 30;
        license.expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
      }
    }
    await saveLicenses(licenses);

    const remainingMs = license.expiresAt ? (license.expiresAt - Date.now()) : null;
    const daysRemaining = remainingMs ? Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24))) : null;

    res.status(200).json({
      success: true,
      clientName: license.clientName || 'Cliente VIP',
      licenseType: license.licenseType || 'permanent',
      expiresAt: license.expiresAt,
      daysRemaining
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};
