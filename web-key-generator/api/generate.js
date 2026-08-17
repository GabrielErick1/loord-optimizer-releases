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
    const { uuid, clientName, licenseType, durationDays } = await parseRequestBody(req);
    
    const key = generateActivationKey(uuid);
    const licenses = await getLicenses();
    const formattedClientName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente VIP';
    
    let resolvedType = 'permanent-unlimited';
    let days = null;

    if (licenseType === 'temporary') {
      resolvedType = 'temporary';
      days = parseInt(durationDays, 10) || 30;
    } else if (licenseType === 'permanent-single') {
      resolvedType = 'permanent-single';
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
      durationDays: days,
      expiresAt: null, // Set on first activation if temporary
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
      durationDays: newLicense.durationDays
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};
