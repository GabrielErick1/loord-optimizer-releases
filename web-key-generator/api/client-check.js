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

    // 1. Se a chave não existir no banco de dados da nuvem, bloqueia imediatamente
    if (!license) {
      res.status(401).json({
        success: false,
        error: 'Chave não encontrada no banco de dados. Solicite uma chave válida ao administrador.'
      });
      return;
    }

    // 2. Se a chave foi revogada pelo administrador
    if (license.status === 'revoked') {
      res.status(403).json({
        success: false,
        error: 'Licença revogada pelo administrador!'
      });
      return;
    }

    // 3. Se a chave está vinculada a outra máquina (ou foi deslogada e UUID limpo)
    if (license.uuid && license.uuid.toLowerCase() !== cleanUuid) {
      res.status(403).json({
        success: false,
        error: 'Chave vinculada a outro computador ou desvinculada pelo administrador.'
      });
      return;
    }

    // 3.1 Tratamento de Chave de ISO
    if (license.isIsoKey || license.keyType === 'iso') {
      const remaining = typeof license.isoUsesRemaining === 'number' ? license.isoUsesRemaining : (parseInt(license.isoUsesTotal, 10) || 1);
      if (remaining <= 0 || license.status === 'used_up') {
        res.status(403).json({
          success: false,
          error: 'Esta chave de formatação já esgotou todos os usos disponíveis.'
        });
        return;
      }

      if (license.status === 'pending') {
        license.status = 'activated';
        license.uuid = cleanUuid;
        license.activatedAt = Date.now();
        license.activatedIp = cleanIp;
        await saveLicenses(licenses);
      }

      res.status(200).json({
        success: true,
        clientName: license.clientName || 'Cliente ISO',
        licenseType: 'iso',
        isIsoKey: true,
        keyType: 'iso',
        isoUsesRemaining: remaining,
        isoUsesTotal: license.isoUsesTotal || remaining,
        timeRemainingStr: remaining === 1 ? '1 Formatação Restante' : `${remaining} Formatações Restantes`
      });
      return;
    }

    // 4. Verificação de expiração para licenças temporárias
    if (license.licenseType === 'temporary') {
      if (license.expiresAt && Date.now() > license.expiresAt) {
        license.status = 'expired';
        await saveLicenses(licenses);
        res.status(403).json({
          success: false,
          error: 'Licença temporária expirada!'
        });
        return;
      }
    }

    // 5. Ativação automática se for primeira inicialização
    license.activatedIp = cleanIp;
    if (license.status === 'pending') {
      license.status = 'activated';
      license.uuid = uuid.trim();
      license.activatedAt = Date.now();
      if (license.licenseType === 'temporary' && !license.expiresAt) {
        const hours = license.durationHours || (license.durationDays ? license.durationDays * 24 : 24 * 30);
        license.expiresAt = Date.now() + (hours * 60 * 60 * 1000);
      }
      await saveLicenses(licenses);
    }

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

    res.status(200).json({
      success: true,
      clientName: license.clientName || 'Cliente VIP',
      licenseType: license.licenseType || 'permanent',
      isIsoKey: false,
      expiresAt: license.expiresAt,
      remainingHours,
      daysRemaining: remainingDays,
      timeRemainingStr
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};

