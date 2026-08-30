const { parseRequestBody, getPlans, getIsoConfig, getLicenses, saveLicenses, generateActivationKey } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bot-User, X-Bot-Pass');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Suporte a compatibilidade com a rota antiga /api/bot-generate
  if (req.headers['x-bot-api-key'] || (req.url && req.url.includes('bot-generate')) || (req.query && req.query.action === 'generate')) {
    const botGen = require('./_botGenerate');
    return botGen(req, res);
  }

  let body = {};
  if (req.method === 'POST') {
    try {
      body = await parseRequestBody(req);
    } catch (_) {}
  }

  const headers = req.headers || {};
  const headerUser = headers['x-bot-user'];
  const headerPass = headers['x-bot-pass'];
  const bodyUser = body.username || body.botUser;
  const bodyPass = body.password || body.botPass;

  const authHeader = headers['authorization'] || '';
  let basicUser = '';
  let basicPass = '';
  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString('utf8');
      const parts = decoded.split(':');
      basicUser = parts[0];
      basicPass = parts[1];
    } catch (_) {}
  }

  const username = (headerUser || bodyUser || basicUser || '').trim().toLowerCase();
  const password = (headerPass || bodyPass || basicPass || '').trim();

  if (username !== 'botranked' || password !== '168096') {
    res.status(401).json({
      success: false,
      error: 'Autenticação do bot inválida. Use o usuário "botranked" e a senha correspondente.'
    });
    return;
  }

  const action = (body.action || req.query.action || 'list-plans').toLowerCase();

  try {
    // 1. AÇÃO: Listar Planos (Normais e ISO)
    if (action === 'list-plans') {
      const normalPlans = await getPlans();
      const isoConfig = await getIsoConfig();

      res.status(200).json({
        success: true,
        normalPlans: normalPlans.filter(p => p.enabled),
        isoConfig: {
          isFree: isoConfig.isFree,
          plans: (isoConfig.plans || []).filter(p => p.enabled)
        }
      });
      return;
    }

    // 2. AÇÃO: Gerar Chave Normal do Painel
    if (action === 'generate-normal') {
      const { clientName, licenseType, durationDays, uuid } = body;
      const cleanName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente Discord';
      const cleanUuid = (uuid && uuid.trim()) ? uuid.trim().toLowerCase() : null;

      let resolvedType = 'temporary';
      let hours = 24 * 30; // padrão 30 dias se não informado
      if (licenseType === 'permanent-unlimited' || licenseType === 'permanent' || licenseType === 'vitalicia') {
        resolvedType = 'permanent-unlimited';
        hours = null;
      } else if (licenseType === 'permanent-single') {
        resolvedType = 'permanent-single';
        hours = null;
      } else {
        resolvedType = 'temporary';
        const dias = Math.max(1, parseInt(durationDays || '30', 10));
        hours = dias * 24;
      }

      const rawUuid = cleanUuid || `bot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const key = generateActivationKey(rawUuid);
      const licenses = await getLicenses();

      const newLicense = {
        uuid: cleanUuid,
        key,
        clientName: cleanName,
        licenseType: resolvedType,
        activationMode: resolvedType === 'permanent-single' ? 'single' : 'unlimited',
        durationHours: hours,
        durationDays: hours ? Math.round(hours / 24) : null,
        expiresAt: null,
        createdBy: 'botranked',
        createdAt: Date.now(),
        status: 'pending',
        activatedAt: null,
        activatedIp: null
      };

      licenses.push(newLicense);
      await saveLicenses(licenses);

      res.status(200).json({
        success: true,
        message: 'Chave normal gerada com sucesso pelo bot!',
        key,
        clientName: cleanName,
        licenseType: resolvedType,
        durationDays: newLicense.durationDays
      });
      return;
    }

    // 3. AÇÃO: Gerar Chave de Formatação ISO
    if (action === 'generate-iso') {
      const { clientName, uses, price, buyerInfo } = body;
      const cleanName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente Discord ISO';
      const usesCount = Math.max(1, parseInt(uses, 10) || 1);
      const cleanPrice = typeof price === 'number' ? price : (parseFloat(price) || (usesCount === 1 ? 50 : usesCount === 2 ? 70 : 100));

      const rawUuid = `bot_iso_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const baseKey = generateActivationKey(rawUuid);
      const key = `ISO-${baseKey.substring(0, 14)}`;

      const licenses = await getLicenses();

      const newLicense = {
        key,
        uuid: null,
        clientName: cleanName,
        isIsoKey: true,
        keyType: 'iso',
        licenseType: 'iso',
        activationMode: 'single',
        isoUsesTotal: usesCount,
        isoUsesRemaining: usesCount,
        pricePaid: cleanPrice,
        buyerInfo: buyerInfo || `Discord - ${cleanName}`,
        createdBy: 'botranked',
        createdAt: Date.now(),
        status: 'pending',
        activatedAt: null,
        lastUsedAt: null
      };

      licenses.push(newLicense);
      await saveLicenses(licenses);

      res.status(200).json({
        success: true,
        message: 'Chave de ISO gerada com sucesso pelo bot!',
        key,
        clientName: cleanName,
        uses: usesCount,
        price: cleanPrice
      });
      return;
    }

    // 4. AÇÃO: Listar Chaves geradas pelo bot
    if (action === 'list-keys') {
      const licenses = await getLicenses();
      const botLicenses = licenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === 'botranked');
      res.status(200).json({
        success: true,
        keys: botLicenses
      });
      return;
    }

    // 5. AÇÃO: Consultar UUID / Status de Chave
    if (action === 'check-uuid' || action === 'check') {
      const targetUuid = (body.uuid || body.oldUuid || req.query.uuid || '').trim().toLowerCase();
      const targetKey = (body.key || req.query.key || '').trim().toUpperCase();

      if (!targetUuid && !targetKey) {
        res.status(400).json({ success: false, error: 'Informe "uuid" ou "key" para consultar.' });
        return;
      }

      const licenses = await getLicenses();
      let license = targetKey
        ? licenses.find(l => l.key && l.key.toUpperCase() === targetKey)
        : licenses.find(l => l.uuid && l.uuid.toLowerCase() === targetUuid);

      if (!license && targetUuid) {
        license = licenses.find(l => Array.isArray(l.history) && l.history.some(h => (h.fromUuid && h.fromUuid.toLowerCase() === targetUuid) || (h.toUuid && h.toUuid.toLowerCase() === targetUuid)));
      }

      if (!license) {
        res.status(404).json({ success: false, found: false, error: 'Nenhuma chave ativa encontrada vinculada a este UUID/Chave.' });
        return;
      }

      const isSingle = license.licenseType === 'permanent-single' || license.activationMode === 'single';
      const isUnlimited = license.licenseType === 'permanent-unlimited' || license.activationMode === 'unlimited' || license.licenseType === 'permanent';

      res.status(200).json({
        success: true,
        found: true,
        key: license.key,
        clientName: license.clientName || 'Cliente',
        planType: license.licenseType,
        planName: isSingle
          ? '👑 Vitalícia - 1 Ativação Única (Chave Descartável pós-uso)'
          : (isUnlimited ? '👑 Vitalícia - Reativação Ilimitada no Mesmo PC (UUID Vinculado)' : 'Personalizado'),
        canReactivate: isUnlimited,
        isSingleActivation: isSingle,
        currentUuid: license.uuid,
        status: license.status,
        activatedAt: license.activatedAt,
        message: isSingle
          ? 'Esta chave é de Ativação Única (descartável). Ela já foi consumida e não permite transferência para outro computador.'
          : 'Chave Vitalícia com Reativação Ilimitada encontrada! Para transferir para outro PC, informe o UUID antigo e o novo UUID.',
        suggestAction: isSingle ? 'require_new_key' : 'allow_transfer'
      });
      return;
    }

    // 6. AÇÃO: Reativar / Transferir Chave para novo UUID
    if (action === 'reactivate' || action === 'transfer') {
      const targetUuid = (body.oldUuid || body.uuid || req.query.oldUuid || req.query.uuid || '').trim().toLowerCase();
      const newUuid = (body.newUuid || req.query.newUuid || '').trim().toLowerCase();
      const targetKey = (body.key || req.query.key || '').trim().toUpperCase();
      const force = body.force === true || req.query.force === 'true';

      if (!newUuid) {
        res.status(400).json({ success: false, error: 'O novo UUID (newUuid) é obrigatório.' });
        return;
      }
      if (!targetUuid && !targetKey) {
        res.status(400).json({ success: false, error: 'Informe o UUID antigo (oldUuid) ou a chave (key) para localizar a licença.' });
        return;
      }

      const licenses = await getLicenses();
      let license = targetKey
        ? licenses.find(l => l.key && l.key.toUpperCase() === targetKey)
        : licenses.find(l => l.uuid && l.uuid.toLowerCase() === targetUuid);

      if (!license && targetUuid) {
        license = licenses.find(l => Array.isArray(l.history) && l.history.some(h => h.fromUuid && h.fromUuid.toLowerCase() === targetUuid));
      }

      if (!license) {
        res.status(404).json({ success: false, error: 'Nenhuma chave foi encontrada com os dados antigos informados.' });
        return;
      }

      if (license.status === 'revoked') {
        res.status(403).json({ success: false, error: 'Esta chave foi revogada pelo administrador.' });
        return;
      }

      const isSingle = license.licenseType === 'permanent-single' || license.activationMode === 'single';
      const isUnlimited = license.licenseType === 'permanent-unlimited' || license.activationMode === 'unlimited' || license.licenseType === 'permanent';

      if (isSingle && !force) {
        res.status(403).json({
          success: false,
          canReactivate: false,
          error: 'Esta chave pertence ao plano "Vitalícia - 1 Ativação Única (Chave Descartável pós-uso)". Ela não permite reativação nem transferência para outro computador.',
          planType: 'permanent-single',
          planName: '👑 Vitalícia - 1 Ativação Única (Chave Descartável pós-uso)',
          key: license.key,
          clientName: license.clientName,
          suggestAction: 'require_new_key'
        });
        return;
      }

      const previousUuid = license.uuid || targetUuid;
      license.uuid = newUuid;
      license.status = 'activated';
      license.lastReactivatedAt = Date.now();
      license.reactivationCount = (license.reactivationCount || 0) + 1;
      license.history = license.history || [];
      license.history.push({
        action: 'reactivate_transfer',
        fromUuid: previousUuid,
        toUuid: newUuid,
        date: Date.now(),
        by: 'botranked',
        forced: isSingle && force
      });

      await saveLicenses(licenses);

      res.status(200).json({
        success: true,
        message: 'Chave reativada com sucesso! O novo computador foi vinculado.',
        key: license.key,
        clientName: license.clientName || 'Cliente VIP',
        planType: license.licenseType,
        planName: isUnlimited
          ? '👑 Vitalícia - Reativação Ilimitada no Mesmo PC (UUID Vinculado)'
          : '👑 Vitalícia - 1 Ativação Única (Forçada por Admin)',
        oldUuid: previousUuid,
        newUuid: newUuid,
        reactivationCount: license.reactivationCount
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: `Ação desconhecida: "${action}". Ações válidas: list-plans, generate-normal, generate-iso, list-keys, check-uuid, reactivate.`
    });
  } catch (e) {
    console.error('[BOT_API_ERROR]', e);
    res.status(500).json({ success: false, error: 'Erro interno ao processar requisição do bot.' });
  }
};
