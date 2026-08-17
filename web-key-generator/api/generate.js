const { parseRequestBody, verifyAuth, generateActivationKey, getLicenses, saveLicenses } = require('./_db');

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
    
    const key = generateActivationKey(uuid);
    const licenses = await getLicenses();
    const formattedClientName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente VIP';
    
    let resolvedType = 'permanent-unlimited';
    let hours = null;

    if (licenseType === 'permanent-single') {
      resolvedType = 'permanent-single';
    } else if (licenseType && (licenseType.startsWith('temp-') || licenseType === 'temporary')) {
      resolvedType = 'temporary';
      
      if (licenseType === 'temp-1h') hours = 1;
      else if (licenseType === 'temp-2h') hours = 2;
      else if (licenseType === 'temp-6h') hours = 6;
      else if (licenseType === 'temp-12h') hours = 12;
      else if (licenseType === 'temp-24h') hours = 24;
      else if (licenseType === 'temp-7d') hours = 7 * 24;
      else if (licenseType === 'temp-15d') hours = 15 * 24;
      else if (licenseType === 'temp-30d') hours = 30 * 24;
      else if (licenseType === 'temp-custom-hours') hours = Math.max(1, parseInt(customVal || durationHours, 10) || 1);
      else if (licenseType === 'temp-custom-days') hours = Math.max(1, (parseInt(customVal || durationDays, 10) || 1) * 24);
      else if (durationHours) hours = Math.max(1, parseInt(durationHours, 10));
      else if (durationDays) hours = Math.max(1, parseInt(durationDays, 10) * 24);
      else hours = 24 * 30; // 30 days default
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
      expiresAt: null, // Definido na primeira ativação pela máquina do cliente
      createdBy: user.username,
      createdAt: Date.now(),
      status: 'pending',
      activatedAt: null,
      activatedIp: null
    };

    // If UUID was provided, replace existing pending/active key for that UUID or push new
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
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};

