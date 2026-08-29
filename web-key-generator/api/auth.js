const checkSession = require('./_checkSession');
const login = require('./_login');

module.exports = async (req, res) => {
  const url = req.url || '';
  const action = (req.query && req.query.action) ? req.query.action : '';
  if (action === 'check-session' || url.includes('check-session') || req.method === 'GET') {
    return checkSession(req, res);
  }
  return login(req, res);
};
