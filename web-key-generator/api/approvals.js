const { parseRequestBody, verifyAuth, getApprovals, saveApprovals, getLicenses, saveLicenses, getOrInitUsers, saveUsers, generateActivationKey } = require('./_db');

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

  const isOwner = user.role === 'owner' || user.username.toLowerCase() === 'gabriel';

  if (req.method === 'GET') {
    try {
      const approvals = await getApprovals();
      // Owners veem todas as solicitações; outros usuários só veem as que eles mesmos solicitaram
      const filtered = isOwner 
        ? approvals 
        : approvals.filter(a => a.requestedBy && a.requestedBy.toLowerCase() === user.username.toLowerCase());

      // Ordena por data decrescente (mais recentes primeiro)
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const pendingKeys = filtered.filter(a => a.type === 'key' && a.status === 'pending');
      const pendingUsers = filtered.filter(a => a.type === 'user' && a.status === 'pending');

      res.status(200).json({
        success: true,
        approvals: filtered,
        pendingTotal: pendingKeys.length + pendingUsers.length,
        pendingKeysCount: pendingKeys.length,
        pendingUsersCount: pendingUsers.length
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao listar aprovações.' });
    }
  } 
  else if (req.method === 'POST') {
    if (!isOwner) {
      res.status(403).json({ success: false, error: 'Apenas Super Administradores (Owners) podem aprovar ou recusar solicitações.' });
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const { action, id, reason } = body;

      if (!id) {
        res.status(400).json({ success: false, error: 'ID da solicitação não informado.' });
        return;
      }

      let approvals = await getApprovals();
      const targetAppr = approvals.find(a => a.id === id);

      if (!targetAppr) {
        res.status(404).json({ success: false, error: 'Solicitação não encontrada.' });
        return;
      }

      // 1. APROVAR CHAVE
      if (action === 'approve-key') {
        const key = targetAppr.generatedKey || generateActivationKey(targetAppr.uuid);
        let licenses = await getLicenses();

        const formattedClientName = (targetAppr.clientName && targetAppr.clientName.trim()) ? targetAppr.clientName.trim() : 'Cliente VIP';
        const cleanUuid = (targetAppr.uuid && targetAppr.uuid.trim().length >= 5) ? targetAppr.uuid.trim() : null;

        const newLicense = {
          uuid: cleanUuid,
          key: key,
          clientName: formattedClientName,
          licenseType: targetAppr.licenseType || 'temporary',
          activationMode: targetAppr.activationMode || 'unlimited',
          durationHours: targetAppr.durationHours || null,
          durationDays: targetAppr.durationDays || null,
          expiresAt: null,
          createdBy: targetAppr.requestedBy || user.username,
          approvedBy: user.username,
          createdAt: Date.now(),
          status: 'pending', // aguardando ativação no app pelo cliente
          activatedAt: null,
          activatedIp: null
        };

        licenses.push(newLicense);
        await saveLicenses(licenses);

        targetAppr.status = 'approved';
        targetAppr.approvedBy = user.username;
        targetAppr.approvedAt = Date.now();
        targetAppr.generatedKey = key;

        await saveApprovals(approvals);

        res.status(200).json({
          success: true,
          message: `Chave aprovada com sucesso! Código gerado: ${key}`,
          key: key,
          approval: targetAppr
        });
        return;
      }

      // 2. RECUSAR CHAVE
      if (action === 'reject-key') {
        targetAppr.status = 'rejected';
        targetAppr.rejectedBy = user.username;
        targetAppr.rejectedAt = Date.now();
        targetAppr.reason = reason || 'Recusada pelo Owner';

        await saveApprovals(approvals);
        res.status(200).json({ success: true, message: 'Solicitação de chave recusada.' });
        return;
      }

      // 3. APROVAR USUÁRIO
      if (action === 'approve-user') {
        let users = await getOrInitUsers();
        const targetUser = users.find(u => u.username.toLowerCase() === targetAppr.username.toLowerCase());

        if (targetUser) {
          targetUser.status = 'active';
          await saveUsers(users);
        }

        targetAppr.status = 'approved';
        targetAppr.approvedBy = user.username;
        targetAppr.approvedAt = Date.now();

        await saveApprovals(approvals);
        res.status(200).json({
          success: true,
          message: `Cadastro do usuário "${targetAppr.username}" aprovado com sucesso! O usuário já pode acessar o painel.`
        });
        return;
      }

      // 4. RECUSAR USUÁRIO
      if (action === 'reject-user') {
        let users = await getOrInitUsers();
        // Remove da lista de usuários
        users = users.filter(u => u.username.toLowerCase() !== targetAppr.username.toLowerCase());
        await saveUsers(users);

        targetAppr.status = 'rejected';
        targetAppr.rejectedBy = user.username;
        targetAppr.rejectedAt = Date.now();
        targetAppr.reason = reason || 'Cadastro recusado pelo Owner';

        await saveApprovals(approvals);
        res.status(200).json({ success: true, message: `Cadastro do usuário "${targetAppr.username}" foi recusado.` });
        return;
      }

      res.status(400).json({ success: false, error: 'Ação desconhecida.' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao processar aprovação.' });
    }
  }
};
