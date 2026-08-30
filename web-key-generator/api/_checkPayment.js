const { verifyAuth, getPlans, getLicenses, saveLicenses, generateActivationKey, getPayment, savePayment, MP_ACCESS_TOKEN } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  const paymentId = req.query ? req.query.paymentId : null;
  if (!paymentId) {
    res.status(400).json({ success: false, error: 'paymentId não informado.' });
    return;
  }

  const user = await verifyAuth(req);

  try {
    const paymentRecord = await getPayment(paymentId);
    if (!paymentRecord) {
      res.status(404).json({ success: false, error: 'Registro de pagamento não encontrado.' });
      return;
    }

    // Se NÃO for pagamento de ISO público e não tiver usuário logado, barra
    if (!paymentRecord.isIsoPayment && !user) {
      res.status(401).json({ success: false, error: 'Não autorizado.' });
      return;
    }

    // Se já foi finalizado anteriormente, retorna a chave existente
    if (paymentRecord.fulfilled && paymentRecord.generatedKey) {
      res.status(200).json({
        success: true,
        approved: true,
        status: 'approved',
        key: paymentRecord.generatedKey,
        isIsoKey: !!paymentRecord.isIsoPayment,
        uses: paymentRecord.uses,
        clientName: paymentRecord.clientName,
        planName: paymentRecord.planName
      });
      return;
    }

    // Query Mercado Pago API for real-time status
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const mpData = await mpRes.json();
    const status = mpData.status || 'pending';

    if (status === 'approved') {
      // ── SE FOR PAGAMENTO DE CHAVE ISO ──
      if (paymentRecord.isIsoPayment) {
        const rawUuid = paymentRecord.uuid || `iso_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        const baseKey = generateActivationKey(rawUuid);
        const key = `ISO-${baseKey.substring(0, 14)}`;
        const licenses = await getLicenses();

        const newLicense = {
          key,
          uuid: paymentRecord.uuid || null,
          clientName: paymentRecord.clientName || 'Cliente ISO',
          isIsoKey: true,
          keyType: 'iso',
          licenseType: 'iso',
          activationMode: 'single',
          isoUsesTotal: paymentRecord.uses || 1,
          isoUsesRemaining: paymentRecord.uses || 1,
          pricePaid: paymentRecord.price,
          buyerInfo: paymentRecord.clientName || 'Cliente ISO',
          createdBy: 'mercadopago_pix',
          createdAt: Date.now(),
          status: 'pending',
          activatedAt: null,
          lastUsedAt: null
        };

        licenses.push(newLicense);
        await saveLicenses(licenses);

        paymentRecord.fulfilled = true;
        paymentRecord.generatedKey = key;
        await savePayment(paymentId, paymentRecord);

        res.status(200).json({
          success: true,
          approved: true,
          status: 'approved',
          key,
          isIsoKey: true,
          uses: paymentRecord.uses,
          clientName: paymentRecord.clientName,
          planName: paymentRecord.planName
        });
        return;
      }

      // Payment confirmed! Generate the license key for normal VIP
      const { planId, clientName, uuid, customVal, username } = paymentRecord;
      const allPlans = await getPlans();
      const plan = allPlans.find(p => p.id === planId) || { id: planId, type: 'temporary', durationHours: 720, name: 'Licença' };

      const key = generateActivationKey(uuid);
      const licenses = await getLicenses();

      let resolvedType = 'permanent-unlimited';
      let hours = null;

      if (plan.id === 'permanent-single') {
        resolvedType = 'permanent-single';
      } else if (plan.id === 'permanent-unlimited') {
        resolvedType = 'permanent-unlimited';
      } else {
        resolvedType = 'temporary';
        if (plan.id === 'temp-1h') hours = 1;
        else if (plan.id === 'temp-2h') hours = 2;
        else if (plan.id === 'temp-6h') hours = 6;
        else if (plan.id === 'temp-12h') hours = 12;
        else if (plan.id === 'temp-24h') hours = 24;
        else if (plan.id === 'temp-7d') hours = 7 * 24;
        else if (plan.id === 'temp-15d') hours = 15 * 24;
        else if (plan.id === 'temp-30d') hours = 30 * 24;
        else if (plan.id === 'temp-custom-hours') hours = Math.max(1, parseInt(customVal, 10) || 1);
        else if (plan.id === 'temp-custom-days') hours = Math.max(1, (parseInt(customVal, 10) || 1) * 24);
        else hours = plan.durationHours || 720;
      }

      const cleanUuid = (uuid && uuid.trim().length >= 5) ? uuid.trim() : null;

      const newLicense = {
        uuid: cleanUuid,
        key,
        clientName: clientName || 'Cliente VIP',
        licenseType: resolvedType,
        activationMode: (resolvedType === 'permanent-single') ? 'single' : 'unlimited',
        durationHours: hours,
        durationDays: hours ? Math.round(hours / 24) : null,
        expiresAt: null,
        createdBy: username || user.username,
        createdAt: Date.now(),
        status: 'pending',
        activatedAt: null,
        activatedIp: null,
        paidWithPix: true,
        paymentId: paymentId
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

      // Update payment record as fulfilled
      paymentRecord.status = 'approved';
      paymentRecord.fulfilled = true;
      paymentRecord.generatedKey = key;
      paymentRecord.approvedAt = Date.now();
      await savePayment(paymentId, paymentRecord);

      res.status(200).json({
        success: true,
        approved: true,
        status: 'approved',
        key,
        clientName: newLicense.clientName,
        planName: plan.name,
        license: newLicense
      });
    } else {
      res.status(200).json({
        success: true,
        approved: false,
        status: status
      });
    }
  } catch (e) {
    console.error('check-payment error:', e);
    res.status(500).json({ success: false, error: 'Erro ao verificar status do pagamento.' });
  }
};
