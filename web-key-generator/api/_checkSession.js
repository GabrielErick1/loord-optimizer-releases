const { verifyAuth } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const user = await verifyAuth(req);
    if (user) {
      res.status(200).json({
        success: true,
        username: user.username,
        isAdmin: !!user.isAdmin,
        role: user.role || (user.isAdmin ? 'admin' : 'vendedor')
      });
    } else {
      res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};
