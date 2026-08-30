const { parseRequestBody, getLicenses, saveLicenses } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bot-User, X-Bot-Pass');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let body = {};
  if (req.method === 'POST') {
    try {
      body = await parseRequestBody(req);
    } catch (_) {}
  }

  // ── Autenticação do Bot do Discord ──
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
      error: 'Autenticação do bot inválida. Use usuário "botranked" e senha "168096".'
    });
    return;
  }

  const action = (body.action || req.query.action || (body.newUuid ? 'reactivate' : 'check-uuid')).toLowerCase();
  const targetUuid = (body.uuid || body.oldUuid || req.query.uuid || '').trim().toLowerCase();
  const newUuid = (body.newUuid || req.query.newUuid || '').trim().toLowerCase();
  const targetKey = (body.key || req.query.key || '').trim().toUpperCase();
  const force = body.force === true || req.query.force === 'true';

  try {
    const licenses = await getLicenses();

    // ══════════════════════════════════════════════════════════════════════════
    // 1. AÇÃO: CHECK-UUID (Consultar status da chave pelo UUID ou pela Chave)
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'check-uuid' || action === 'check') {
      if (!targetUuid && !targetKey) {
        res.status(400).json({
          success: false,
          error: 'Informe o "uuid" ou a "key" para consultar.'
        });
        return;
      }

      let license = null;
      if (targetKey) {
        license = licenses.find(l => l.key && l.key.toUpperCase() === targetKey);
      } else if (targetUuid) {
        license = licenses.find(l => l.uuid && l.uuid.toLowerCase() === targetUuid);
        // Se não achou pelo uuid atual, verifica se esteve no histórico
        if (!license) {
          license = licenses.find(l => Array.isArray(l.history) && l.history.some(h => (h.fromUuid && h.fromUuid.toLowerCase() === targetUuid) || (h.toUuid && h.toUuid.toLowerCase() === targetUuid)));
        }
      }

      if (!license) {
        res.status(404).json({
          success: false,
          found: false,
          error: 'Nenhuma chave ativa encontrada vinculada a este UUID/Chave.'
        });
        return;
      }

      const isSingle = license.licenseType === 'permanent-single' || license.activationMode === 'single';
      const isUnlimited = license.licenseType === 'permanent-unlimited' || license.activationMode === 'unlimited' || license.licenseType === 'permanent';

      let planName = 'Personalizado';
      if (isSingle) {
        planName = '👑 Vitalícia - 1 Ativação Única (Chave Descartável pós-uso)';
      } else if (isUnlimited) {
        planName = '👑 Vitalícia - Reativação Ilimitada no Mesmo PC (UUID Vinculado)';
      } else if (license.licenseType === 'temporary') {
        planName = `⏳ Temporária (${license.durationDays ? license.durationDays + ' dias' : 'Personalizada'})`;
      } else if (license.isIsoKey) {
        planName = '🎫 Formatação ISO';
      }

      res.status(200).json({
        success: true,
        found: true,
        key: license.key,
        clientName: license.clientName || 'Cliente',
        planType: license.licenseType,
        planName,
        canReactivate: isUnlimited,
        isSingleActivation: isSingle,
        currentUuid: license.uuid,
        status: license.status,
        activatedAt: license.activatedAt,
        message: isSingle
          ? 'Esta chave pertence ao plano Vitalícia - 1 Ativação Única (Descartável). Ela já foi consumida e não permite transferência para outro computador. O usuário precisa adquirir uma nova ativação.'
          : (isUnlimited
              ? 'Chave Vitalícia com Reativação Ilimitada encontrada! Para transferir para outro PC, informe o UUID antigo e o novo UUID.'
              : 'Licença encontrada.'),
        suggestAction: isSingle ? 'require_new_key' : (isUnlimited ? 'allow_transfer' : 'none')
      });
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. AÇÃO: REACTIVATE (Reativar / Transferir Chave do UUID antigo para o novo)
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'reactivate' || action === 'transfer') {
      if (!newUuid) {
        res.status(400).json({
          success: false,
          error: 'O novo UUID (newUuid) é obrigatório para vincular o novo computador.'
        });
        return;
      }

      if (!targetUuid && !targetKey) {
        res.status(400).json({
          success: false,
          error: 'Informe o UUID antigo (oldUuid) ou a chave (key) para localizar a licença.'
        });
        return;
      }

      let license = null;
      if (targetKey) {
        license = licenses.find(l => l.key && l.key.toUpperCase() === targetKey);
      } else if (targetUuid) {
        license = licenses.find(l => l.uuid && l.uuid.toLowerCase() === targetUuid);
        if (!license) {
          license = licenses.find(l => Array.isArray(l.history) && l.history.some(h => h.fromUuid && h.fromUuid.toLowerCase() === targetUuid));
        }
      }

      if (!license) {
        res.status(404).json({
          success: false,
          error: 'Nenhuma chave foi encontrada com os dados antigos informados.'
        });
        return;
      }

      if (license.status === 'revoked') {
        res.status(403).json({
          success: false,
          error: 'Esta chave foi revogada pelo administrador e não pode ser reativada.'
        });
        return;
      }

      const isSingle = license.licenseType === 'permanent-single' || license.activationMode === 'single';
      const isUnlimited = license.licenseType === 'permanent-unlimited' || license.activationMode === 'unlimited' || license.licenseType === 'permanent';

      // Se for ativação única e NÃO foi forçado por admin
      if (isSingle && !force) {
        res.status(403).json({
          success: false,
          canReactivate: false,
          error: 'Esta chave pertence ao plano "Vitalícia - 1 Ativação Única (Chave Descartável pós-uso)". Ela não permite reativação nem transferência para outro computador.',
          planType: 'permanent-single',
          planName: '👑 Vitalícia - 1 Ativação Única (Chave Descartável pós-uso)',
          key: license.key,
          clientName: license.clientName,
          uuidVinculado: license.uuid,
          suggestAction: 'require_new_key'
        });
        return;
      }

      // Se for Reativação Ilimitada (ou força admin)
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
          : (isSingle ? '👑 Vitalícia - 1 Ativação Única (Forçada por Admin)' : 'Personalizado'),
        oldUuid: previousUuid,
        newUuid: newUuid,
        reactivationCount: license.reactivationCount
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: `Ação desconhecida: "${action}". Ações válidas: "check-uuid", "reactivate".`
    });
  } catch (err) {
    console.error('[BOT_REACTIVATE_ERROR]', err);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao processar reativação.'
    });
  }
};
