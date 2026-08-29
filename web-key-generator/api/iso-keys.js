const { parseRequestBody, verifyAuth, getLicenses, saveLicenses, generateActivationKey } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Não autorizado.' });
    return;
  }

  const isOwnerOrAdmin = user.isAdmin || user.username.toLowerCase() === 'gabriel' || user.role === 'worn' || user.role === 'owner';

  if (req.method === 'GET') {
    try {
      const licenses = await getLicenses();
      // Filtra apenas licenças de ISO
      let isoLicenses = licenses.filter(l => l.isIsoKey || (l.keyType === 'iso'));

      if (!isOwnerOrAdmin) {
        // Vendedor só vê as que ele gerou
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
      const { clientName, uses, price, buyerInfo, uuid } = body;

      const cleanClientName = (clientName && clientName.trim()) ? clientName.trim() : 'Cliente ISO';
      const cleanUuid = (uuid && uuid.trim()) ? uuid.trim().toLowerCase() : null;
      const usesCount = Math.max(1, parseInt(uses, 10) || 1);
      const cleanPrice = typeof price === 'number' ? price : (parseFloat(price) || 50.00);

      // Gera chave única
      const rawUuid = cleanUuid || `iso_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const baseKey = generateActivationKey(rawUuid);
      // Prefixo identificador para clareza
      const key = `ISO-${baseKey.substring(0, 14)}`;

      const licenses = await getLicenses();

      const newLicense = {
        key,
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
        status: 'pending', // 'pending' -> 'activated' ao logar -> 'used_up' quando zerar usos
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
  } else {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
};
