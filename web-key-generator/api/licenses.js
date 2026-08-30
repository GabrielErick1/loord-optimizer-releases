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

  const isMasterAdmin = user.isAdmin || (user.username && user.username.toLowerCase() === 'gabriel') || user.role === 'worn' || user.role === 'owner';

  // ─── GET: Listar Licenças ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const licenses = await getLicenses();
      const filteredLicenses = isMasterAdmin
        ? licenses
        : licenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === user.username.toLowerCase());
      res.status(200).json({ success: true, licenses: filteredLicenses });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro interno ao listar licenças.' });
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

      const cleanSearchKey = key ? key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
      const cleanSearchUuid = uuid ? uuid.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';

      let licenses = await getLicenses();
      const index = licenses.findIndex(l => {
        if (cleanSearchKey && l.key && l.key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanSearchKey) return true;
        if (cleanSearchUuid && l.uuid && l.uuid.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanSearchUuid) return true;
        return false;
      });

      if (index === -1) {
        res.status(404).json({ success: false, error: 'Licença não encontrada.' });
        return;
      }

      const lic = licenses[index];

      // Non-admins can only renew licenses they created
      if (!isMasterAdmin && lic.createdBy && lic.createdBy.toLowerCase() !== user.username.toLowerCase()) {
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
        if (licenseType === 'temp-1h') durationHours = 1;
        else if (licenseType === 'temp-2h') durationHours = 2;
        else if (licenseType === 'temp-6h') durationHours = 6;
        else if (licenseType === 'temp-12h') durationHours = 12;
        else if (licenseType === 'temp-24h') durationHours = 24;
        else if (licenseType === 'temp-7d') durationHours = 7 * 24;
        else if (licenseType === 'temp-15d') durationHours = 15 * 24;
        else if (licenseType === 'temp-30d') durationHours = 30 * 24;
        else if (licenseType === 'temp-custom-hours') durationHours = parseInt(customVal, 10) || 24;
        else if (licenseType === 'temp-custom-days') durationHours = (parseInt(customVal, 10) || 30) * 24;

        newDurationHours = durationHours;
        newDurationDays = Math.ceil(durationHours / 24);
        newExpiresAt = Date.now() + durationHours * 60 * 60 * 1000;
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

      const returnLicenses = isMasterAdmin
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
  // ─── POST / DELETE: Ações de Licença (Revogar, Alternar Status, Desvincular, Excluir) ───
  else if (req.method === 'POST' || req.method === 'DELETE') {
    try {
      const body = await parseRequestBody(req);
      const { uuid, key, action } = body;

      // 1. Sync de Licenças do cache de cliente (se houver clientLicenses)
      if (Array.isArray(body.clientLicenses) && body.clientLicenses.length > 0) {
        let serverLicenses = await getLicenses();
        const map = new Map();
        serverLicenses.forEach(l => map.set(l.key, l));

        body.clientLicenses.forEach(l => {
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

        const returnLicenses = isMasterAdmin
          ? merged
          : merged.filter(l => l.createdBy && l.createdBy.toLowerCase() === user.username.toLowerCase());

        res.status(200).json({ success: true, licenses: returnLicenses });
        return;
      }

      if (!uuid && !key) {
        const licenses = await getLicenses();
        const returnLicenses = isMasterAdmin
          ? licenses
          : licenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === user.username.toLowerCase());
        res.status(200).json({ success: true, licenses: returnLicenses });
        return;
      }

      const cleanSearchKey = key ? key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
      const cleanSearchUuid = uuid ? uuid.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';

      let licenses = await getLicenses();
      const index = licenses.findIndex(l => {
        if (cleanSearchKey && l.key && l.key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanSearchKey) return true;
        if (cleanSearchUuid && l.uuid && l.uuid.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanSearchUuid) return true;
        return false;
      });

      if (index === -1) {
        res.status(404).json({ success: false, error: 'Licença não encontrada no banco de dados.' });
        return;
      }

      const targetLicense = licenses[index];

      // Non-admins can only manage licenses they created
      if (!isMasterAdmin && targetLicense.createdBy && targetLicense.createdBy.toLowerCase() !== user.username.toLowerCase()) {
        res.status(403).json({ success: false, error: 'Você só pode gerenciar licenças criadas por você.' });
        return;
      }

      const isWorn = user.role === 'worn' || user.role === 'owner' || (user.username && user.username.toLowerCase() === 'gabriel');

      // AÇÃO 1: Desvincular PC
      if (action === 'unlink') {
        targetLicense.uuid = null;
        targetLicense.status = 'pending';
        targetLicense.activatedAt = null;
        targetLicense.activatedIp = null;
        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: 'Computador desvinculado com sucesso.', licenses });
        return;
      }
      
      // AÇÃO 2: Excluir Chave Permanentemente (Apenas WORN / OWNER)
      else if (action === 'delete' || action === 'delete-key') {
        if (!isWorn) {
          res.status(403).json({ success: false, error: 'Apenas Worn / Dono tem permissão para excluir registros permanentemente.' });
          return;
        }

        licenses.splice(index, 1);
        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: 'Chave excluída permanentemente com sucesso.', licenses });
        return;
      }

      // AÇÃO 3: Alternar Status (Toggle Revogada / Ativa)
      else if (action === 'toggle-status') {
        if (targetLicense.status === 'revoked') {
          if (targetLicense.isIsoKey || targetLicense.keyType === 'iso') {
            const rem = typeof targetLicense.isoUsesRemaining === 'number' ? targetLicense.isoUsesRemaining : (targetLicense.isoUsesTotal || 1);
            targetLicense.status = rem > 0 ? 'activated' : 'used_up';
          } else {
            targetLicense.status = targetLicense.uuid ? 'activated' : 'pending';
          }
        } else {
          targetLicense.status = 'revoked';
        }
        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: `Status alterado para ${targetLicense.status}.`, status: targetLicense.status, licenses });
        return;
      }

      // AÇÃO 4: Revogar (Default)
      else {
        targetLicense.status = 'revoked';
        await saveLicenses(licenses);
        res.status(200).json({ success: true, message: 'Licença revogada com sucesso.', status: 'revoked', licenses });
        return;
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro interno ao processar licença.' });
    }
  }
  else {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
};
