const { parseRequestBody, verifyAuth, getOrInitUsers, saveUsers, getLicenses, hashPassword } = require('./_db');

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

  // Helper to map and attach sales stats
  async function getEnrichedUserList() {
    const users = await getOrInitUsers();
    const licenses = await getLicenses();

    return users.map(u => {
      const userLicenses = licenses.filter(l => l.createdBy && l.createdBy.toLowerCase() === u.username.toLowerCase());
      const activeCount = userLicenses.filter(l => l.status === 'activated' && !(l.licenseType === 'temporary' && l.expiresAt && Date.now() > l.expiresAt)).length;

      return {
        username: u.username,
        isAdmin: !!u.isAdmin,
        status: u.status || 'active',
        createdBy: u.createdBy || 'Master Admin',
        createdAt: u.createdAt || null,
        totalKeys: userLicenses.length,
        activeKeys: activeCount
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
    if (!user.isAdmin && user.username.toLowerCase() !== 'gabriel') {
      res.status(403).json({ success: false, error: 'Apenas administradores podem gerenciar usuários.' });
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const { action, usernameToUpdate, newPassword, usernameToToggle, newUsername, newIsAdmin, syncUsers } = body;

      // 1. Ação de Mudar Senha
      if (action === 'change-password') {
        if (!usernameToUpdate || !newPassword || newPassword.trim().length < 3) {
          res.status(400).json({ success: false, error: 'Digite uma senha válida (mínimo 3 caracteres).' });
          return;
        }

        let users = await getOrInitUsers();
        const target = users.find(u => u.username.toLowerCase() === usernameToUpdate.trim().toLowerCase());

        if (!target) {
          res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
          return;
        }

        target.passwordHash = hashPassword(newPassword.trim());
        await saveUsers(users);

        const userList = await getEnrichedUserList();
        res.status(200).json({ success: true, message: `Senha do usuário "${target.username}" alterada com sucesso!`, users: userList });
        return;
      }

      // 2. Ação de Inativar / Ativar Usuário
      if (action === 'toggle-status') {
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

      const newUser = {
        username: newUsername.trim(),
        passwordHash: hashPassword(newPassword.trim()),
        isAdmin: !!newIsAdmin,
        status: 'active',
        createdBy: user.username,
        createdAt: Date.now()
      };

      users.push(newUser);
      await saveUsers(users);

      const userList = await getEnrichedUserList();
      res.status(200).json({ success: true, message: `Usuário "${newUser.username}" cadastrado com sucesso!`, users: userList });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao processar usuário.' });
    }
  } 
  else if (req.method === 'DELETE') {
    if (!user.isAdmin && user.username.toLowerCase() !== 'gabriel') {
      res.status(403).json({ success: false, error: 'Apenas administradores podem excluir usuários.' });
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
