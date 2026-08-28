const { parseRequestBody, verifyAuth, getOrInitUsers, saveUsers, getLicenses, hashPassword, getApprovals, saveApprovals, getUserRole } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

  const userRole = user.role || getUserRole(user);
  const isOwner = userRole === 'owner' || user.username.toLowerCase() === 'gabriel';
  const isAdmin = userRole === 'admin' || user.isAdmin;

  // Helper to map and attach sales stats, role, and limits
  async function getEnrichedUserList() {
    const users = await getOrInitUsers();
    const licenses = await getLicenses();
    const todayStr = new Date().toISOString().slice(0, 10);

    return users.map(u => {
      const userLicenses = licenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === u.username.toLowerCase());
      const activeCount = userLicenses.filter(l => l.status === 'activated' && !(l.licenseType === 'temporary' && l.expiresAt && Date.now() > l.expiresAt)).length;

      let todayUsage = 0;
      if (u.freeUsageToday && u.freeUsageToday.date === todayStr) {
        todayUsage = u.freeUsageToday.count || 0;
      }

      const uRole = getUserRole(u);

      return {
        username: u.username,
        role: uRole,
        isAdmin: uRole === 'owner' || uRole === 'admin',
        status: u.status || 'active',
        createdBy: u.createdBy || 'Master Owner',
        createdAt: u.createdAt || null,
        totalKeys: userLicenses.length,
        activeKeys: activeCount,
        allowedPlans: Array.isArray(u.allowedPlans) ? u.allowedPlans : [],
        directPlans: Array.isArray(u.directPlans) ? u.directPlans : [],
        allPlansDirect: !!u.allPlansDirect,
        freeDailyLimit: typeof u.freeDailyLimit === 'number' ? u.freeDailyLimit : 5,
        freeUsageToday: todayUsage
      };
    });
  }

  if (req.method === 'GET') {
    try {
      const userList = await getEnrichedUserList();
      res.status(200).json({ success: true, users: userList });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro interno.' });
    }
  } 
  else if (req.method === 'POST') {
    if (!isOwner && !isAdmin) {
      res.status(403).json({ success: false, error: 'Apenas Administradores e Owners podem gerenciar usuários.' });
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const { action, usernameToUpdate, newPassword, usernameToToggle, newUsername, newRole, newIsAdmin, allowedPlans, directPlans, allPlansDirect, freeDailyLimit, syncUsers } = body;

      // 0. Ação de Editar Usuário Completo (Cargo, Senha, Planos Permitidos, Planos Diretos, Limite Diário)
      if (action === 'edit-user') {
        if (!usernameToUpdate) {
          res.status(400).json({ success: false, error: 'Usuário não informado.' });
          return;
        }

        let users = await getOrInitUsers();
        const target = users.find(u => u.username.toLowerCase() === usernameToUpdate.trim().toLowerCase());
        if (!target) {
          res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
          return;
        }

        // Apenas Owner pode alterar cargos ou editar outros Admins/Owners
        if (!isOwner && usernameToUpdate.trim().toLowerCase() !== user.username.toLowerCase()) {
          const targetRole = getUserRole(target);
          if (targetRole === 'owner' || targetRole === 'admin') {
            res.status(403).json({ success: false, error: 'Apenas o Owner pode editar contas de Administrador ou Owner.' });
            return;
          }
        }

        if (isOwner && usernameToUpdate.trim().toLowerCase() !== 'gabriel') {
          if (newRole && ['owner', 'admin', 'vendedor'].includes(newRole)) {
            target.role = newRole;
            target.isAdmin = (newRole === 'owner' || newRole === 'admin');
          } else if (newIsAdmin !== undefined) {
            target.isAdmin = !!newIsAdmin;
            target.role = target.isAdmin ? 'admin' : 'vendedor';
          }
        }

        if (newPassword && newPassword.trim().length >= 3) {
          target.passwordHash = hashPassword(newPassword.trim());
        }

        if (Array.isArray(allowedPlans)) {
          target.allowedPlans = allowedPlans;
        }

        if (Array.isArray(directPlans)) {
          target.directPlans = directPlans;
        }

        if (allPlansDirect !== undefined) {
          target.allPlansDirect = !!allPlansDirect;
        }

        if (freeDailyLimit !== undefined) {
          target.freeDailyLimit = Math.max(0, parseInt(freeDailyLimit, 10) || 0);
        }

        await saveUsers(users);
        const userList = await getEnrichedUserList();
        res.status(200).json({ success: true, message: `Dados do usuário "${target.username}" atualizados com sucesso!`, users: userList });
        return;
      }

      // 1. Ação de Trocar Cargo
      if (action === 'toggle-role') {
        if (!isOwner) {
          res.status(403).json({ success: false, error: 'Apenas Super Administradores (Owners) podem alterar cargos.' });
          return;
        }
        if (!usernameToToggle) {
          res.status(400).json({ success: false, error: 'Usuário não informado.' });
          return;
        }
        if (usernameToToggle.trim().toLowerCase() === 'gabriel') {
          res.status(400).json({ success: false, error: 'O cargo do usuário principal (gabriel) não pode ser alterado.' });
          return;
        }
        let users = await getOrInitUsers();
        const target = users.find(u => u.username.toLowerCase() === usernameToToggle.trim().toLowerCase());
        if (!target) {
          res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
          return;
        }

        const currentRole = getUserRole(target);
        let nextRole = 'admin';
        if (currentRole === 'vendedor') nextRole = 'admin';
        else if (currentRole === 'admin') nextRole = 'owner';
        else nextRole = 'vendedor';

        target.role = nextRole;
        target.isAdmin = (nextRole === 'owner' || nextRole === 'admin');

        await saveUsers(users);
        const roleLabels = { owner: '👑 Owner (Super Admin)', admin: '🛡️ Administrador', vendedor: '👤 Vendedor' };
        const userList = await getEnrichedUserList();
        res.status(200).json({ success: true, message: `Cargo do usuário "${target.username}" alterado para ${roleLabels[nextRole]}!`, users: userList });
        return;
      }

      // 2. Ação de Inativar / Ativar Usuário
      if (action === 'toggle-status') {
        if (!isOwner) {
          res.status(403).json({ success: false, error: 'Apenas Super Administradores (Owners) podem inativar ou ativar usuários.' });
          return;
        }
        if (!usernameToToggle) {
          res.status(400).json({ success: false, error: 'Usuário não informado.' });
          return;
        }

        if (usernameToToggle.trim().toLowerCase() === 'gabriel') {
          res.status(400).json({ success: false, error: 'O usuário principal (gabriel) não pode ser inativado.' });
          return;
        }

        let users = await getOrInitUsers();
        const target = users.find(u => u.username.toLowerCase() === usernameToToggle.trim().toLowerCase());

        if (!target) {
          res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
          return;
        }

        target.status = (target.status === 'inactive') ? 'active' : 'inactive';
        await saveUsers(users);

        const statusLabel = target.status === 'active' ? 'Ativado' : 'Inativado/Bloqueado';
        const userList = await getEnrichedUserList();
        res.status(200).json({ success: true, message: `Usuário "${target.username}" foi ${statusLabel} com sucesso!`, users: userList });
        return;
      }

      // 3. Sincronização do Cache do Navegador
      if (Array.isArray(syncUsers) && syncUsers.length > 0) {
        let currentUsers = await getOrInitUsers();
        const userMap = new Map();
        currentUsers.forEach(u => userMap.set(u.username.toLowerCase(), u));
        
        syncUsers.forEach(su => {
          if (!userMap.has(su.username.toLowerCase()) && su.passwordHash) {
            userMap.set(su.username.toLowerCase(), su);
          }
        });

        const merged = Array.from(userMap.values());
        await saveUsers(merged);
        
        const userList = await getEnrichedUserList();
        res.status(200).json({ success: true, users: userList });
        return;
      }

      // 4. Criação de Novo Usuário / Vendedor
      if (!newUsername || !newPassword) {
        res.status(400).json({ success: false, error: 'Preencha o nome de usuário e a senha.' });
        return;
      }

      const cleanUsername = newUsername.trim().toLowerCase();
      const users = await getOrInitUsers();
      const exists = users.some(u => u.username.toLowerCase() === cleanUsername);
      
      if (exists) {
        res.status(400).json({ success: false, error: 'Este nome de usuário já existe.' });
        return;
      }

      const parsedLimit = freeDailyLimit !== undefined ? Math.max(0, parseInt(freeDailyLimit, 10) || 0) : 5;

      // REGRAS DE CARGO NA CRIAÇÃO:
      // Se quem estiver criando for ADMIN (e não Owner): só pode criar Vendedor ("criar usuario que nao seja admin e nem worn")!
      // E o cadastro gerado pelo Admin fica pendente de aprovação do Owner!
      let resolvedRole = 'vendedor';
      let userInitialStatus = 'active';

      if (!isOwner) {
        resolvedRole = 'vendedor';
        userInitialStatus = 'pending_approval';
      } else {
        if (newRole && ['owner', 'admin', 'vendedor'].includes(newRole)) {
          resolvedRole = newRole;
        } else if (newIsAdmin) {
          resolvedRole = 'admin';
        }
      }

      const isResolvedAdmin = resolvedRole === 'owner' || resolvedRole === 'admin';

      const newUser = {
        username: newUsername.trim(),
        passwordHash: hashPassword(newPassword.trim()),
        role: resolvedRole,
        isAdmin: isResolvedAdmin,
        status: userInitialStatus,
        createdBy: user.username,
        createdAt: Date.now(),
        allowedPlans: Array.isArray(allowedPlans) ? allowedPlans : [],
        directPlans: Array.isArray(directPlans) ? directPlans : (isResolvedAdmin ? ['all'] : []),
        allPlansDirect: isOwner ? (allPlansDirect !== undefined ? !!allPlansDirect : isResolvedAdmin) : false,
        freeDailyLimit: parsedLimit,
        freeUsageToday: { date: new Date().toISOString().slice(0, 10), count: 0 }
      };

      users.push(newUser);
      await saveUsers(users);

      // Se foi criado por um Admin, envia para a fila de aprovação dos Owners!
      if (userInitialStatus === 'pending_approval') {
        let approvals = await getApprovals();
        approvals.push({
          id: 'appr_usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          type: 'user',
          requestedBy: user.username,
          requesterRole: userRole,
          username: newUser.username,
          role: resolvedRole,
          status: 'pending',
          createdAt: Date.now(),
          approvedBy: null,
          approvedAt: null,
          rejectedBy: null,
          rejectedAt: null
        });
        await saveApprovals(approvals);

        const userList = await getEnrichedUserList();
        res.status(200).json({
          success: true,
          pendingApproval: true,
          message: `⏳ Solicitação de cadastro do usuário "${newUser.username}" enviada com sucesso aos Owners! O cadastro ficará ativo assim que for aprovado na Central de Aprovações.`,
          users: userList
        });
        return;
      }

      const userList = await getEnrichedUserList();
      res.status(200).json({ success: true, message: `Usuário "${newUser.username}" cadastrado com sucesso!`, users: userList });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao processar usuário.' });
    }
  } 
  else if (req.method === 'DELETE') {
    if (!isOwner) {
      res.status(403).json({ success: false, error: 'Apenas Super Administradores (Owners) podem excluir usuários.' });
      return;
    }

    try {
      const { usernameToDelete } = await parseRequestBody(req);
      if (!usernameToDelete) {
        res.status(400).json({ success: false, error: 'Nome de usuário requerido para exclusão.' });
        return;
      }

      if (usernameToDelete.trim().toLowerCase() === 'gabriel') {
        res.status(400).json({ success: false, error: 'O usuário principal (gabriel) não pode ser excluído.' });
        return;
      }

      let users = await getOrInitUsers();
      const index = users.findIndex(u => u.username.toLowerCase() === usernameToDelete.trim().toLowerCase());
      
      if (index === -1) {
        res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
        return;
      }

      users.splice(index, 1);
      await saveUsers(users);

      const userList = await getEnrichedUserList();
      res.status(200).json({ success: true, message: 'Usuário removido com sucesso.', users: userList });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao excluir usuário.' });
    }
  }
  else {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
};
