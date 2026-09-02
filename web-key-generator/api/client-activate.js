const { parseRequestBody, generateActivationKey, getLicenses, saveLicenses, createClientSessionToken } = require('./_db');

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
    const { uuid, key, appName, appId, appVersion } = await parseRequestBody(req);
    if (!uuid || !key) {
      res.status(400).json({ success: false, error: 'UUID e chave requeridos.' });
      return;
    }

    // 0. Validação Server-Side de Identidade: Se foi alterado o nome da aplicação, recusa no backend
    if (appName && (appName !== 'Loord Optimizer' || (appId && appId !== 'com.loord.optimizer'))) {
      res.status(403).json({
        success: false,
        error: 'Violação de Integridade: Identidade da aplicação adulterada. Requisição recusada pelo servidor oficial.'
      });
      return;
    }

    const cleanKey = key.trim().toUpperCase();
    const cleanUuid = uuid.trim().toLowerCase();
    const licenses = await getLicenses();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
    const cleanIp = ip.split(',')[0].trim();

    let license = licenses.find(l => l.key && l.key.toUpperCase() === cleanKey);

    // 1. Chave deve existir no banco de dados da nuvem
    if (!license) {
      res.status(401).json({
        success: false,
        error: 'Chave não cadastrada no sistema. Solicite uma chave válida ao seu vendedor.'
      });
      return;
    }

    // 2. Chave revogada
    if (license.status === 'revoked') {
      res.status(403).json({
        success: false,
        error: license.revokeReason || 'Esta chave foi revogada pelo administrador!'
      });
      return;
    }

    // 2.1 Detecção de Anomalia e Rate-Limiting Server-Side
    const now = Date.now();
    license.activationHistory = Array.isArray(license.activationHistory) ? license.activationHistory : [];
    license.activationHistory = license.activationHistory.filter(h => now - h.time < 2 * 60 * 60 * 1000);
    license.activationHistory.push({ uuid: cleanUuid, ip: cleanIp, time: now });

    const distinctUuids = new Set(license.activationHistory.map(h => h.uuid));
    if (distinctUuids.size >= 3) {
      license.status = 'revoked';
      license.revokeReason = 'Detecção de Anomalia Server-Side: Chave compartilhada em múltiplos computadores.';
      await saveLicenses(licenses);
      res.status(403).json({
        success: false,
        error: 'Licença bloqueada pelo servidor: Uso indevido em múltiplos computadores detectado.'
      });
      return;
    }

    // 3. Se a chave já pertence a outro computador
    if (license.uuid && license.uuid.toLowerCase() !== cleanUuid) {
      res.status(403).json({
        success: false,
        error: 'Esta chave já está em uso em outro computador!'
      });
      return;
    }

    // 4. Verificação de expiração se for temporária
    if (license.licenseType === 'temporary') {
      if (!license.activatedAt) {
        license.activatedAt = Date.now();
        const hours = license.durationHours || (license.durationDays ? license.durationDays * 24 : 24 * 30);
        license.expiresAt = Date.now() + (hours * 60 * 60 * 1000);
      } else if (license.expiresAt && Date.now() > license.expiresAt) {
        license.status = 'expired';
        await saveLicenses(licenses);
        res.status(403).json({ success: false, error: 'Sua licença temporária expirou! Entre em contato para renovar.' });
        return;
      }
    }

    license.status = 'activated';
    license.uuid = uuid.trim();
    license.activatedAt = license.activatedAt || Date.now();
    license.activatedIp = cleanIp;
    await saveLicenses(licenses);

    const remainingMs = license.expiresAt ? Math.max(0, license.expiresAt - Date.now()) : null;
    const remainingHours = remainingMs !== null ? Math.ceil(remainingMs / (1000 * 60 * 60)) : null;
    const remainingDays = remainingHours !== null ? Math.ceil(remainingHours / 24) : null;

    let timeRemainingStr = 'Vitalícia';
    if (remainingMs !== null) {
      if (remainingHours <= 1) {
        const remainingMin = Math.max(1, Math.ceil(remainingMs / (1000 * 60)));
        timeRemainingStr = `${remainingMin} min restantes`;
      } else if (remainingHours <= 48) {
        timeRemainingStr = `${remainingHours}h restantes`;
      } else {
        timeRemainingStr = `${remainingDays} dias restantes`;
      }
    }

    // Gera o sessionToken criptográfico assinado pelo servidor
    const sessionToken = createClientSessionToken(cleanKey, cleanUuid, license.licenseType);

    res.status(200).json({
      success: true,
      sessionToken,
      message: (license.licenseType === 'permanent-unlimited' && license.activatedAt)
        ? 'Chave permanente validada com sucesso!'
        : 'Chave ativada com sucesso neste computador!',
      clientName: license.clientName || 'Cliente VIP',
      licenseType: license.licenseType,
      expiresAt: license.expiresAt || null,
      timeRemainingStr: timeRemainingStr
    });
  } catch (error) {
    console.error('Erro em client-activate:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao validar chave.' });
  }
};
