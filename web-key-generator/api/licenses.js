const { parseRequestBody, verifyAuth, getLicenses, saveLicenses } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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

  if (req.method === 'GET') {
    try {
      const licenses = await getLicenses();
      const filteredLicenses = user.isAdmin 
        ? licenses 
        : licenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === user.username.toLowerCase());
      res.status(200).json({ success: true, licenses: filteredLicenses });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro interno.' });
    }
  } 
  else if (req.method === 'POST') {
    // Sync / Merge licenses from admin client cache
    try {
      const { clientLicenses } = await parseRequestBody(req);
      if (Array.isArray(clientLicenses) && clientLicenses.length > 0) {
        let serverLicenses = await getLicenses();
        const map = new Map();
        serverLicenses.forEach(l => map.set(l.key, l));
        
        clientLicenses.forEach(l => {
          if (!map.has(l.key)) {
            map.set(l.key, l);
          } else {
            const existing = map.get(l.key);
            if (l.status === 'activated' && existing.status !== 'revoked') {
              existing.status = 'activated';
              existing.uuid = l.uuid || existing.uuid;
              existing.activatedAt = l.activatedAt || existing.activatedAt;
            } else if (l.status === 'revoked') {
              existing.status = 'revoked';
            }
          }
        });

        const merged = Array.from(map.values());
        await saveLicenses(merged);
        
        const returnLicenses = user.isAdmin 
          ? merged 
          : merged.filter(l => l.createdBy && l.createdBy.toLowerCase() === user.username.toLowerCase());

        res.status(200).json({ success: true, licenses: returnLicenses });
        return;
      }
      const licenses = await getLicenses();
      const returnLicenses = user.isAdmin 
        ? licenses 
        : licenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === user.username.toLowerCase());
      res.status(200).json({ success: true, licenses: returnLicenses });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro interno.' });
    }
  }
  // ─── PATCH: Renovar / Reativar uma Licença ────────────────────────────────
  else if (req.method === 'PATCH') {
    try {
      const { key, uuid, licenseType, customVal } = await parseRequestBody(req);

      if (!key && !uuid) {
        res.status(400).json({ success: false, error: 'Chave ou UUID requeridos para renovação.' });
        return;
      }

      let licenses = await getLicenses();
      const index = licenses.findIndex(l => {
        if (key && l.key && l.key.toUpperCase() === key.trim().toUpperCase()) return true;
        if (uuid && l.uuid && l.uuid.toLowerCase() === uuid.trim().toLowerCase()) return true;
        return false;
      });

      if (index === -1) {
        res.status(404).json({ success: false, error: 'Licença não encontrada.' });
        return;
      }

      const lic = licenses[index];

      // Non-admins can only renew licenses they created
      if (!user.isAdmin && lic.createdBy && lic.createdBy.toLowerCase() !== user.username.toLowerCase()) {
        res.status(403).json({ success: false, error: 'Você só pode renovar licenças criadas por você.' });
        return;
      }

      // Calcular nova expiração baseada no tipo de licença
      let newExpiresAt = null;
      let newLicenseType = 'permanent';
      let newDurationHours = null;
      let newDurationDays = null;
      let newActivationMode = 'reactivatable';

      if (licenseType === 'permanent-unlimited') {
        newLicenseType = 'permanent';
        newActivationMode = 'reactivatable';
        newExpiresAt = null;
      } else if (licenseType === 'permanent-single') {
        newLicenseType = 'permanent-single';
        newActivationMode = 'single-use';
        newExpiresAt = null;
      } else {
        // Temporária — calcular horas
        newLicenseType = 'temporary';
        newActivationMode = 'temporary';

        let durationHours = 0;
        if (licenseType === 'temp-1h')   durationHours = 1;
        else if (licenseType === 'temp-2h')  durationHours = 2;
        else if (licenseType === 'temp-6h')  durationHours = 6;
        else if (licenseType === 'temp-12h') durationHours = 12;
        else if (licenseType === 'temp-24h') durationHours = 24;
        else if (licenseType === 'temp-7d')  durationHours = 7 * 24;
        else if (licenseType === 'temp-15d') durationHours = 15 * 24;
        else if (licenseType === 'temp-30d') durationHours = 30 * 24;
        else if (licenseType === 'temp-custom-hours') durationHours = parseInt(customVal, 10) || 24;
        else if (licenseType === 'temp-custom-days')  durationHours = (parseInt(customVal, 10) || 30) * 24;

        newDurationHours = durationHours;
        newDurationDays = Math.ceil(durationHours / 24);

        // Se a licença já está ativada (tem UUID), a renovação começa agora
        // Se estiver pendente, o expiresAt será definido apenas ao ativar
        if (lic.uuid && lic.status !== 'pending') {
          newExpiresAt = Date.now() + durationHours * 60 * 60 * 1000;
        } else {
          // Pendente: calcular a partir de agora para referência, mas será recalculado na ativação
          newExpiresAt = Date.now() + durationHours * 60 * 60 * 1000;
        }
      }

      // Aplicar renovação
      lic.status = lic.uuid ? 'activated' : 'pending';
      lic.licenseType = newLicenseType;
      lic.activationMode = newActivationMode;
      lic.expiresAt = newExpiresAt;
      lic.durationHours = newDurationHours;
      lic.durationDays = newDurationDays;
      lic.renewedAt = Date.now();
      lic.renewedBy = user.username;

      await saveLicenses(licenses);

      const returnLicenses = user.isAdmin
        ? licenses
        : licenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === user.username.toLowerCase());

      res.status(200).json({
        success: true,
        message: `Licença "${lic.key}" renovada com sucesso!`,
        licenses: returnLicenses
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao renovar licença.' });
    }
  }
  else if (req.method === 'DELETE') {
    try {
      const { uuid, key, action } = await parseRequestBody(req);
      if (!uuid && !key) {
        res.status(400).json({ success: false, error: 'UUID ou Chave requeridos.' });
        return;
      }

      let licenses = await getLicenses();
      const index = licenses.findIndex(l => {
        if (key && l.key && l.key.toUpperCase() === key.trim().toUpperCase()) return true;
        if (uuid && l.uuid && l.uuid.toLowerCase() === uuid.trim().toLowerCase()) return true;
        return false;
      });
      
      if (index === -1) {
        res.status(404).json({ success: false, error: 'Licença não encontrada.' });
        return;
      }

      const targetLicense = licenses[index];

      // Non-admins can only manage licenses they created
      if (!user.isAdmin && targetLicense.createdBy && targetLicense.createdBy.toLowerCase() !== user.username.toLowerCase()) {
        res.status(403).json({ success: false, error: 'Você só pode gerenciar licenças criadas por você.' });
        return;
      }

      if (action === 'unlink') {
        // Desvincular PC: desloga a máquina, limpa o UUID e volta a chave para status pendente
        targetLicense.uuid = null;
        targetLicense.status = 'pending';
        targetLicense.activatedAt = null;
        targetLicense.activatedIp = null;
        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: 'Computador desvinculado com sucesso.', licenses });
        return;
      } else if (action === 'delete') {
        // Excluir chave completamente
        licenses.splice(index, 1);
        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: 'Chave excluída permanentemente.', licenses });
        return;
      } else {
        // Default action: Revogar / Invalidar Chave
        targetLicense.status = 'revoked';
        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: 'Licença revogada e invalidada com sucesso.', licenses });
        return;
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro interno.' });
    }
  } 
  else {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
};


