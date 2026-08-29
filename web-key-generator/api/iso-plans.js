const { parseRequestBody, verifyAuth, getIsoConfig, saveIsoConfig } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const config = await getIsoConfig();
      res.status(200).json({
        success: true,
        isFree: !!config.isFree,
        plans: config.plans || []
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao obter configurações de planos da ISO.' });
    }
  } else if (req.method === 'POST') {
    const user = await verifyAuth(req);
    if (!user || (!user.isAdmin && user.username.toLowerCase() !== 'gabriel')) {
      res.status(403).json({ success: false, error: 'Apenas administradores podem configurar planos da ISO.' });
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const { isFree, plans } = body;

      const currentConfig = await getIsoConfig();
      const updatedConfig = {
        isFree: isFree !== undefined ? !!isFree : currentConfig.isFree,
        plans: Array.isArray(plans) ? plans.map(p => ({
          id: String(p.id || `iso_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
          name: String(p.name || 'Plano de Formatação'),
          uses: Math.max(1, parseInt(p.uses, 10) || 1),
          price: typeof p.price === 'number' ? Math.max(0, p.price) : parseFloat(p.price) || 0.00,
          enabled: p.enabled !== undefined ? !!p.enabled : true
        })) : currentConfig.plans
      };

      await saveIsoConfig(updatedConfig);

      res.status(200).json({
        success: true,
        message: 'Configurações e planos da ISO salvos com sucesso!',
        config: updatedConfig
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao salvar configurações da ISO.' });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
};
