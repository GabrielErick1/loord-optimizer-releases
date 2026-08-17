const { parseRequestBody, getOrInitUsers, hashPassword, createSessionToken } = require('./_db');

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

  try {
    const { username, password } = await parseRequestBody(req);
    if (!username || !password) {
      res.status(400).json({ success: false, error: 'Preencha todos os campos.' });
      return;
    }

    const cleanPassword = String(password).trim();
    const cleanUsername = String(username).trim().toLowerCase();
    const isMaster = (cleanUsername === 'gabriel' || cleanUsername === 'admin') && cleanPassword === '168096';

    if (isMaster) {
      const token = createSessionToken('gabriel', true);
      res.status(200).json({
        success: true,
        token,
        username: 'gabriel',
        isAdmin: true
      });
      return;
    }

    const users = await getOrInitUsers();
    const user = users.find(u => u.username && u.username.trim().toLowerCase() === cleanUsername);

    if (!user) {
      res.status(401).json({ success: false, error: 'Usuário não encontrado.' });
      return;
    }

    const expectedHash = hashPassword(cleanPassword);
    const isPasswordCorrect = (user.passwordHash === expectedHash) || (user.password === cleanPassword) || (user.passwordHash === cleanPassword);

    if (!isPasswordCorrect) {
      res.status(401).json({ success: false, error: 'Senha incorreta.' });
      return;
    }

    if (user.status === 'inactive') {
      res.status(403).json({ success: false, error: '❌ Seu acesso foi inativado/bloqueado pelo administrador!' });
      return;
    }

    const token = createSessionToken(user.username, user.isAdmin);
    res.status(200).json({
      success: true,
      token,
      username: user.username,
      isAdmin: !!user.isAdmin
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Erro interno do servidor.' });
  }
};
