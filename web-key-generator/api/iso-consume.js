const { parseRequestBody, getLicenses, saveLicenses, getIsoConfig } = require('./_db');

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
    const cleanKey = (key || '').trim().toUpperCase();
    const cleanUuid = (uuid || '').trim().toLowerCase();

    // 1. Verifica se a ISO está em modo Grátis
    const config = await getIsoConfig();
    if (config.isFree) {
      res.status(200).json({
        success: true,
        isFree: true,
        remaining: 9999,
        shouldLogout: false,
        message: 'Formatação autorizada no modo gratuito!'
      });
      return;
    }

    if (!cleanKey) {
      res.status(400).json({ success: false, error: 'Chave não informada.' });
      return;
    }

    const licenses = await getLicenses();
    const license = licenses.find(l => l.key && l.key.toUpperCase() === cleanKey);

    if (!license) {
      res.status(404).json({ success: false, error: 'Chave não encontrada no banco de dados.' });
      return;
    }

    if (license.status === 'revoked') {
      res.status(403).json({ success: false, error: 'Chave revogada pelo administrador.' });
      return;
    }

    // Se a chave for específica de ISO
    if (license.isIsoKey || license.keyType === 'iso') {
      const remaining = typeof license.isoUsesRemaining === 'number' ? license.isoUsesRemaining : (parseInt(license.isoUsesTotal, 10) || 1);

      if (remaining <= 0 || license.status === 'used_up') {
        res.status(403).json({
          success: false,
          error: 'Esta chave de formatação já foi utilizada e não possui mais usos disponíveis.'
        });
        return;
      }

      const newRemaining = remaining - 1;
      license.isoUsesRemaining = newRemaining;
      license.lastUsedAt = Date.now();

      let shouldLogout = false;
      if (newRemaining <= 0) {
        license.status = 'used_up';
        shouldLogout = true;
      } else {
        license.status = 'activated';
      }

      await saveLicenses(licenses);

      res.status(200).json({
        success: true,
        remaining: newRemaining,
        total: license.isoUsesTotal,
        shouldLogout,
        message: shouldLogout
          ? 'Formatação concluída! O uso desta chave foi esgotado.'
          : `Formatação concluída! Restam ${newRemaining} usos nesta chave.`
      });
      return;
    }

    // Se for chave VIP normal
    res.status(200).json({
      success: true,
      isVip: true,
      remaining: 9999,
      shouldLogout: false,
      message: 'Uso registrado com sucesso para licença VIP.'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Erro interno ao processar uso da ISO.' });
  }
};
