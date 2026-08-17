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
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
    const cleanIp = ip.split(',')[0].trim();

    let license = licenses.find(l => l.key && l.key.toUpperCase() === cleanKey);
    const expectedCryptoKey = generateActivationKey(uuid);

    if (!license) {
      if (cleanKey === expectedCryptoKey) {
        // Cryptographically valid direct key -> register as permanent-unlimited
        license = {
          uuid: uuid.trim(),
          key: cleanKey,
          clientName: 'Cliente VIP',
          licenseType: 'permanent-unlimited',
          activationMode: 'unlimited',
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
          message: 'Ativação registrada com sucesso!',
          clientName: 'Cliente VIP',
          licenseType: 'permanent-unlimited',
          expiresAt: null
        });
        return;
      } else {
        res.status(400).json({ success: false, error: 'Chave de ativação inválida.' });
        return;
      }
    }

    // License exists
    if (license.status === 'revoked') {
      res.status(403).json({ success: false, error: 'Esta licença foi revogada pelo administrador.' });
      return;
    }

    // TIPO 1: VITALÍCIA - USO ÚNICO (Chave descartável pós ativação)
    if (license.licenseType === 'permanent-single' || license.activationMode === 'single') {
      if (license.status === 'activated') {
        if (license.uuid && license.uuid.toLowerCase() === cleanUuid) {
          res.status(400).json({
            success: false,
            error: 'Esta chave é de uso único e já foi ativada neste computador. O aplicativo já está registrado!'
          });
          return;
        } else {
          res.status(403).json({
            success: false,
            error: 'Esta chave é de uso único e já foi utilizada em outro computador!'
          });
          return;
        }
      }
    }

    // TIPO 2: VITALÍCIA - REATIVAÇÃO ILIMITADA NO MESMO PC (UUID)
    if (license.licenseType === 'permanent-unlimited' || license.licenseType === 'permanent') {
      if (license.uuid && license.uuid.toLowerCase() !== cleanUuid) {
        res.status(403).json({
          success: false,
          error: 'Esta chave está vinculada exclusivamente a outro computador!'
        });
        return;
      }
    }

    // Check device binding for temporary keys
    if (license.licenseType === 'temporary' && license.uuid && license.uuid.toLowerCase() !== cleanUuid) {
      res.status(403).json({
        success: false,
        error: 'Esta chave já está em uso em outro computador!'
      });
      return;
    }

    // Bind UUID if it was a standalone pre-paid key
    if (!license.uuid) {
      license.uuid = uuid.trim();
    }

    // Check temporary expiration
    if (license.licenseType === 'temporary') {
      if (!license.activatedAt) {
        license.activatedAt = Date.now();
        const days = license.durationDays || 30;
        license.expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
      } else if (license.expiresAt && Date.now() > license.expiresAt) {
        res.status(403).json({ success: false, error: 'Sua licença temporária expirou! Entre em contato para renovar.' });
        return;
      }
    }

    license.status = 'activated';
    license.activatedAt = license.activatedAt || Date.now();
    license.activatedIp = cleanIp;
    await saveLicenses(licenses);

    const remainingMs = license.expiresAt ? (license.expiresAt - Date.now()) : null;
    const daysRemaining = remainingMs ? Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24))) : null;

    res.status(200).json({
      success: true,
      message: (license.licenseType === 'permanent-unlimited' && license.activatedAt)
        ? 'Reativação realizada com sucesso neste computador!' 
        : 'Ativação realizada com sucesso!',
      clientName: license.clientName || 'Cliente VIP',
      licenseType: license.licenseType,
      activationMode: license.activationMode || 'unlimited',
      expiresAt: license.expiresAt,
      daysRemaining
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};
