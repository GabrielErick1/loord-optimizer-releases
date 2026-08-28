const { parseRequestBody, verifyAuth, generateActivationKey, getLicenses, saveLicenses, getPlans, getOrInitUsers, saveUsers, getApprovals, saveApprovals, getUserRole } = require('./_db');

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

  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Não autorizado.' });
    return;
  }

  try {
    const { uuid, clientName, licenseType, durationHours, durationDays, customVal } = await parseRequestBody(req);
    
    const allPlans = await getPlans();
    const planId = licenseType || 'permanent-unlimited';
    const plan = allPlans.find(p => p.id === planId) || { id: planId, name: 'Licença', price: 0, isFree: true, enabled: true };

    if (!plan.enabled) {
      res.status(400).json({ success: false, error: 'Este tipo de plano foi desativado temporariamente pelo administrador.' });
      return;
    }

    const userRole = user.role || getUserRole(user);
    const isOwner = userRole === 'owner' || user.username.toLowerCase() === 'gabriel';
    const isAdmin = userRole === 'admin' || user.isAdmin;

    const users = await getOrInitUsers();
    const currentUser = users.find(u => u.username.toLowerCase() === user.username.toLowerCase());

    const formattedClientName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente VIP';
    const cleanUuid = (uuid && uuid.trim().length >= 5) ? uuid.trim() : null;

    let resolvedType = 'permanent-unlimited';
    let hours = null;

    if (planId === 'permanent-single') {
      resolvedType = 'permanent-single';
    } else if (planId === 'permanent-unlimited') {
      resolvedType = 'permanent-unlimited';
    } else if (planId.startsWith('temp-') || planId === 'temporary') {
      resolvedType = 'temporary';
      if (planId === 'temp-1h') hours = 1;
      else if (planId === 'temp-2h') hours = 2;
      else if (planId === 'temp-6h') hours = 6;
      else if (planId === 'temp-12h') hours = 12;
      else if (planId === 'temp-24h') hours = 24;
      else if (planId === 'temp-7d') hours = 7 * 24;
      else if (planId === 'temp-15d') hours = 15 * 24;
      else if (planId === 'temp-30d') hours = 30 * 24;
      else if (planId === 'temp-custom-hours') hours = Math.max(1, parseInt(customVal || durationHours, 10) || 1);
      else if (planId === 'temp-custom-days') hours = Math.max(1, (parseInt(customVal || durationDays, 10) || 1) * 24);
      else if (durationHours) hours = Math.max(1, parseInt(durationHours, 10));
      else if (durationDays) hours = Math.max(1, parseInt(durationDays, 10) * 24);
      else hours = plan.durationHours || 720;
    } else {
      resolvedType = 'permanent-unlimited';
    }

    // 1. CHECAGEM DE APROVAÇÃO NECESSÁRIA
    // Se for Owner: NUNCA precisa de aprovação
    // Se for Admin ou Vendedor: verifica se o plano está liberado direto ou se precisa de aprovação do Owner
    let needsApproval = false;
    if (!isOwner) {
      const allDirect = currentUser && currentUser.allPlansDirect === true;
      const directPlans = (currentUser && Array.isArray(currentUser.directPlans)) ? currentUser.directPlans : [];
      const isThisPlanDirect = allDirect || directPlans.includes(plan.id);

      if (!isThisPlanDirect) {
        needsApproval = true;
      }
    }

    // Se NÃO for Owner nem Admin (ou seja, for Vendedor)
    if (!isOwner && !isAdmin) {
      // 1. Check if vendor has permission to generate this plan
      if (currentUser && Array.isArray(currentUser.allowedPlans) && currentUser.allowedPlans.length > 0) {
        if (!currentUser.allowedPlans.includes(plan.id)) {
          res.status(403).json({ success: false, error: 'Você não possui permissão para gerar este tipo de plano.' });
          return;
        }
      }

      // 2. Check if plan is paid or free
      let price = Number(plan.price) || 0;
      let planDisplayName = plan.name;

      if (plan.id === 'temp-custom-days') {
        const daysCount = Math.max(1, parseInt(customVal || durationDays, 10) || 1);
        price = price * daysCount;
        planDisplayName = `${plan.name} (${daysCount} dias)`;
      } else if (plan.id === 'temp-custom-hours') {
        const hoursCount = Math.max(1, parseInt(customVal || durationHours, 10) || 1);
        price = price * hoursCount;
        planDisplayName = `${plan.name} (${hoursCount} horas)`;
      }

      const isFree = plan.isFree || price <= 0;

      if (!isFree) {
        // Paid plan: requires PIX payment via Mercado Pago
        res.status(200).json({
          success: false,
          requirePayment: true,
          planId: plan.id,
          planName: planDisplayName,
          price: price,
          message: `Este plano (${planDisplayName}) é pago (R$ ${price.toFixed(2).replace('.', ',')}). Conclua o pagamento via PIX para gerar a chave.`
        });
        return;
      }

      // 3. Free plan: check vendor's daily free limit
      const todayStr = new Date().toISOString().slice(0, 10);
      const freeDailyLimit = (currentUser && typeof currentUser.freeDailyLimit === 'number') ? currentUser.freeDailyLimit : 5;

      let todayUsage = 0;
      if (currentUser && currentUser.freeUsageToday && currentUser.freeUsageToday.date === todayStr) {
        todayUsage = currentUser.freeUsageToday.count || 0;
      }

      if (todayUsage >= freeDailyLimit) {
        res.status(429).json({
          success: false,
          error: `❌ Limite diário de chaves de teste atingido (${todayUsage}/${freeDailyLimit} hoje). Seu limite diário será renovado amanhã!`
        });
        return;
      }

      // Increment today's usage
      if (!currentUser.freeUsageToday || currentUser.freeUsageToday.date !== todayStr) {
        currentUser.freeUsageToday = { date: todayStr, count: 1 };
      } else {
        currentUser.freeUsageToday.count += 1;
      }
      await saveUsers(users);
    }

    // SE PRECISAR DE APROVAÇÃO DO OWNER:
    if (needsApproval) {
      let approvals = await getApprovals();
      const approvalItem = {
        id: 'appr_key_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        type: 'key',
        requestedBy: user.username,
        requesterRole: userRole,
        clientName: formattedClientName,
        uuid: cleanUuid,
        planId: plan.id,
        planName: plan.name,
        licenseType: resolvedType,
        activationMode: (resolvedType === 'permanent-single') ? 'single' : 'unlimited',
        durationHours: hours,
        durationDays: hours ? Math.round(hours / 24) : null,
        status: 'pending',
        createdAt: Date.now(),
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null
      };

      approvals.push(approvalItem);
      await saveApprovals(approvals);

      res.status(200).json({
        success: true,
        pendingApproval: true,
        approvalId: approvalItem.id,
        planName: plan.name,
        clientName: formattedClientName,
        message: `⏳ Solicitação de Chave enviada para aprovação do Owner!\n\nComo o seu usuário não possui liberação direta para este plano (${plan.name}), a chave foi encaminhada para a Central de Aprovações dos Owners.`
      });
      return;
    }

    // Geração direta da chave (seja Owner ou liberado direto)
    const key = generateActivationKey(uuid);
    const licenses = await getLicenses();

    // Verificar se o UUID já está cadastrado no sistema
    if (cleanUuid) {
      const existingLicense = licenses.find(l => l.uuid && l.uuid.toLowerCase() === cleanUuid.toLowerCase());
      if (existingLicense) {
        const clientNameFound = existingLicense.clientName || 'Cliente';
        const keyFound = existingLicense.key || 'Desconhecida';
        const sellerFound = existingLicense.createdBy || 'outro vendedor';
        res.status(400).json({
          success: false,
          error: `⚠️ Este UUID já está cadastrado para o cliente "${clientNameFound}" (Chave: ${keyFound}, Vendedor: ${sellerFound}). Renove a validade da chave existente na aba "Chaves Ativas" ou troque de UUID!`
        });
        return;
      }
    }

    const newLicense = {
      uuid: cleanUuid,
      key,
      clientName: formattedClientName,
      licenseType: resolvedType,
      activationMode: (resolvedType === 'permanent-single') ? 'single' : 'unlimited',
      durationHours: hours,
      durationDays: hours ? Math.round(hours / 24) : null,
      expiresAt: null,
      createdBy: user.username,
      createdAt: Date.now(),
      status: 'pending',
      activatedAt: null,
      activatedIp: null
    };

    licenses.push(newLicense);
    await saveLicenses(licenses);

    res.status(200).json({
      success: true,
      uuid: cleanUuid || 'Aguardando Ativação',
      key,
      clientName: formattedClientName,
      licenseType: newLicense.licenseType,
      activationMode: newLicense.activationMode,
      durationHours: newLicense.durationHours,
      durationDays: newLicense.durationDays
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Erro interno ao gerar chave.' });
  }
};
