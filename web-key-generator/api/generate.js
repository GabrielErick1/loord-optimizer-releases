const { parseRequestBody, verifyAuth, generateActivationKey, getLicenses, saveLicenses, getPlans, getOrInitUsers, saveUsers } = require('./_db');

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

    const isAdminUser = user.isAdmin || user.username.toLowerCase() === 'gabriel';
    let currentUser = null;

    if (!isAdminUser) {
      const users = await getOrInitUsers();
      currentUser = users.find(u => u.username.toLowerCase() === user.username.toLowerCase());

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

    // Generate the license key
    const key = generateActivationKey(uuid);
    const licenses = await getLicenses();
    const formattedClientName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente VIP';
    
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
    
    const cleanUuid = (uuid && uuid.trim().length >= 5) ? uuid.trim() : null;

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

    if (cleanUuid) {
      const index = licenses.findIndex(l => l.uuid && l.uuid.toLowerCase() === cleanUuid.toLowerCase());
      if (index !== -1) {
        licenses[index] = newLicense;
      } else {
        licenses.push(newLicense);
      }
    } else {
      licenses.push(newLicense);
    }
    
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
