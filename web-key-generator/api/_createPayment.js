const { parseRequestBody, verifyAuth, getPlans, getOrInitUsers, getLicenses, savePayment, MP_ACCESS_TOKEN } = require('./_db');
const crypto = require('crypto');

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
    const { planId, clientName, uuid, customVal, durationHours, durationDays } = await parseRequestBody(req);

    if (!planId) {
      res.status(400).json({ success: false, error: 'Plano não informado.' });
      return;
    }

    const allPlans = await getPlans();
    const plan = allPlans.find(p => p.id === planId);

    if (!plan) {
      res.status(404).json({ success: false, error: 'Plano não encontrado.' });
      return;
    }

    if (!plan.enabled) {
      res.status(400).json({ success: false, error: 'Este plano foi desativado temporariamente pelo administrador.' });
      return;
    }

    // Check user allowed plans if not admin
    if (!user.isAdmin && user.username.toLowerCase() !== 'gabriel') {
      const users = await getOrInitUsers();
      const currentUser = users.find(u => u.username.toLowerCase() === user.username.toLowerCase());
      if (currentUser && Array.isArray(currentUser.allowedPlans) && currentUser.allowedPlans.length > 0) {
        if (!currentUser.allowedPlans.includes(plan.id)) {
          res.status(403).json({ success: false, error: 'Você não tem permissão para gerar este plano.' });
          return;
        }
      }
    }

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

    if (price <= 0) {
      res.status(400).json({ success: false, error: 'Este plano é gratuito e não requer pagamento.' });
      return;
    }

    const formattedClientName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente VIP';
    const cleanUuid = (uuid && uuid.trim().length >= 5) ? uuid.trim() : null;

    // Verificar se o UUID já está cadastrado no sistema
    if (cleanUuid) {
      const licenses = await getLicenses();
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

    const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    // Create PIX Payment on Mercado Pago
    const mpPayload = {
      transaction_amount: Number(price.toFixed(2)),
      description: `Loord Optimizer - ${planDisplayName} (${user.username})`,
      payment_method_id: 'pix',
      payer: {
        email: `${user.username.replace(/[^a-z0-9]/gi, '')}@loordoptimizer.com`,
        first_name: user.username,
        last_name: 'Vendedor'
      },
      metadata: {
        vendor_username: user.username,
        plan_id: plan.id,
        plan_name: planDisplayName,
        price: price,
        client_name: formattedClientName,
        uuid: cleanUuid,
        custom_val: customVal || durationHours || durationDays || null
      }
    };

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(mpPayload)
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok || !mpData || !mpData.id) {
      console.error('Mercado Pago Error:', mpData);
      const errMsg = mpData && mpData.message ? mpData.message : 'Erro ao gerar PIX no Mercado Pago.';
      res.status(500).json({ success: false, error: errMsg });
      return;
    }

    const paymentId = String(mpData.id);
    const txData = mpData.point_of_interaction && mpData.point_of_interaction.transaction_data;
    const qrCode = txData ? txData.qr_code : null;
    const qrCodeBase64 = txData ? txData.qr_code_base64 : null;

    // Save pending payment record
    await savePayment(paymentId, {
      paymentId,
      status: 'pending',
      username: user.username,
      planId: plan.id,
      planName: plan.name,
      price: price,
      clientName: formattedClientName,
      uuid: cleanUuid,
      customVal: customVal || durationHours || durationDays || null,
      createdAt: Date.now(),
      fulfilled: false
    });

    res.status(200).json({
      success: true,
      paymentId,
      status: mpData.status,
      price: price,
      planName: plan.name,
      qrCode,
      qrCodeBase64
    });
  } catch (e) {
    console.error('create-payment error:', e);
    res.status(500).json({ success: false, error: 'Erro ao processar pagamento.' });
  }
};
