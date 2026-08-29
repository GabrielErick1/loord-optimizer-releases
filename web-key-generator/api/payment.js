const checkPayment = require('./_checkPayment');
const createPayment = require('./_createPayment');

module.exports = async (req, res) => {
  const url = req.url || '';
  const action = (req.query && req.query.action) ? req.query.action : '';
  if (action === 'check' || url.includes('check-payment') || req.method === 'GET') {
    return checkPayment(req, res);
  }
  return createPayment(req, res);
};
