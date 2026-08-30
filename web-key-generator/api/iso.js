const { parseRequestBody, verifyAuth, getLicenses, saveLicenses, generateActivationKey, getIsoConfig, saveIsoConfig } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bot-Api-Key');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = req.url || '';
  const action = (req.query && req.query.action) ? req.query.action : '';

  // 1. Rota de Planos da ISO (/api/iso-plans)
  if (action === 'plans' || url.includes('iso-plans')) {
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
      return;
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
      return;
    } else {
      res.status(405).json({ success: false, error: 'Method Not Allowed' });
      return;
    }
  }

  // 2. Rota de Consumo da ISO (/api/iso-consume)
  if (action === 'consume' || url.includes('iso-consume')) {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method Not Allowed' });
      return;
    }

    try {
      const { uuid, key } = await parseRequestBody(req);
      const cleanKey = (key || '').trim().toUpperCase();
      const cleanUuid = (uuid || '').trim().toLowerCase();

      // Verifica se a ISO está em modo Grátis
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
      return;
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro interno ao processar uso da ISO.' });
      return;
    }
  }

  // 3. Rota de Listagem e Geração de Chaves da ISO (/api/iso-keys)
  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Não autorizado.' });
    return;
  }

  const isOwnerOrAdmin = user.isAdmin || user.username.toLowerCase() === 'gabriel' || user.role === 'worn' || user.role === 'owner';

  if (req.method === 'GET') {
    try {
      const licenses = await getLicenses();
      let isoLicenses = licenses.filter(l => l.isIsoKey || (l.keyType === 'iso'));

      if (!isOwnerOrAdmin) {
        isoLicenses = isoLicenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === user.username.toLowerCase());
      }

      res.status(200).json({
        success: true,
        keys: isoLicenses
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao listar chaves de ISO.' });
    }
  } else if (req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { clientName, uses, price, buyerInfo, uuid, action, key } = body;

      // Se for ação de revogação ou exclusão via POST
      if (action === 'toggle-status' || action === 'revoke' || action === 'delete' || action === 'delete-key') {
        const cleanKey = (key || '').trim().toUpperCase();
        let licenses = await getLicenses();
        const index = licenses.findIndex(l => l.key && l.key.toUpperCase() === cleanKey);
        if (index === -1) {
          res.status(404).json({ success: false, error: 'Chave não encontrada.' });
          return;
        }

        const lic = licenses[index];
        const isWorn = user.role === 'worn' || user.role === 'owner' || user.username.toLowerCase() === 'gabriel';

        if (action === 'delete' || action === 'delete-key') {
          if (!isWorn) {
            res.status(403).json({ success: false, error: 'Apenas Worn / Dono pode excluir chaves permanentemente.' });
            return;
          }
          licenses.splice(index, 1);
          await saveLicenses(licenses);
          res.status(200).json({ success: true, message: 'Chave excluída permanentemente.' });
          return;
        }

        // Toggle / Revoke
        if (action === 'toggle-status') {
          if (lic.status === 'revoked') {
            const rem = typeof lic.isoUsesRemaining === 'number' ? lic.isoUsesRemaining : (lic.isoUsesTotal || 1);
            lic.status = rem > 0 ? 'activated' : 'used_up';
          } else {
            lic.status = 'revoked';
          }
        } else {
          lic.status = 'revoked';
        }

        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: `Status alterado para ${lic.status}.`, status: lic.status });
        return;
      }

      const cleanClientName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente ISO';
      const cleanUuid = (uuid && uuid.trim()) ? uuid.trim().toLowerCase() : null;
      const usesCount = Math.max(1, parseInt(uses, 10) || 1);
      const cleanPrice = typeof price === 'number' ? price : (parseFloat(price) || 50.00);

      const rawUuid = cleanUuid || `iso_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const baseKey = generateActivationKey(rawUuid);
      const newKey = `ISO-${baseKey.substring(0, 14)}`;

      const licenses = await getLicenses();

      const newLicense = {
        key: newKey,
        uuid: cleanUuid,
        clientName: cleanClientName,
        isIsoKey: true,
        keyType: 'iso',
        licenseType: 'iso',
        activationMode: 'single',
        isoUsesTotal: usesCount,
        isoUsesRemaining: usesCount,
        pricePaid: cleanPrice,
        buyerInfo: buyerInfo || cleanClientName,
        createdBy: user.username,
        createdAt: Date.now(),
        status: 'pending',
        activatedAt: null,
        lastUsedAt: null
      };

      licenses.push(newLicense);
      await saveLicenses(licenses);

      res.status(200).json({
        success: true,
        message: 'Chave de formatação ISO gerada com sucesso!',
        license: newLicense
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao gerar chave de ISO.' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const body = await parseRequestBody(req);
      const { key, action } = body;
      const cleanKey = (key || '').trim().toUpperCase();

      let licenses = await getLicenses();
      const index = licenses.findIndex(l => l.key && l.key.toUpperCase() === cleanKey);
      if (index === -1) {
        res.status(404).json({ success: false, error: 'Chave não encontrada.' });
        return;
      }

      const lic = licenses[index];
      const isWorn = user.role === 'worn' || user.role === 'owner' || user.username.toLowerCase() === 'gabriel';

      if (action === 'delete') {
        if (!isWorn) {
          res.status(403).json({ success: false, error: 'Apenas Worn / Dono pode excluir chaves permanentemente.' });
          return;
        }
        licenses.splice(index, 1);
        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: 'Chave excluída permanentemente.' });
        return;
      }

      lic.status = 'revoked';
      await saveLicenses(licenses);
      res.status(200).json({ success: true, message: 'Chave revogada com sucesso.', status: 'revoked' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao processar exclusão/revogação da chave.' });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
};
