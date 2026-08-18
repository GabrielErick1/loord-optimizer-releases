const { parseRequestBody, verifyAuth, getPlans, savePlans, getOrInitUsers } = require('./_db');

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

  if (req.method === 'GET') {
    try {
      const allPlans = await getPlans();
      
      if (user.isAdmin || user.username.toLowerCase() === 'gabriel') {
        // Admin sees all plans (including disabled and all pricing info)
        res.status(200).json({
          success: true,
          isAdmin: true,
          plans: allPlans
        });
        return;
      }

      // Vendor user: filter allowed and enabled plans
      const users = await getOrInitUsers();
      const currentUser = users.find(u => u.username.toLowerCase() === user.username.toLowerCase());
      
      const allowedIds = (currentUser && Array.isArray(currentUser.allowedPlans) && currentUser.allowedPlans.length > 0)
        ? currentUser.allowedPlans
        : null; // null means all active plans are allowed

      const todayStr = new Date().toISOString().slice(0, 10);
      let todayCount = 0;
      if (currentUser && currentUser.freeUsageToday && currentUser.freeUsageToday.date === todayStr) {
        todayCount = currentUser.freeUsageToday.count || 0;
      }
      const freeDailyLimit = (currentUser && typeof currentUser.freeDailyLimit === 'number') ? currentUser.freeDailyLimit : 5;
      const freeRemainingToday = Math.max(0, freeDailyLimit - todayCount);

      const vendorPlans = allPlans
        .filter(p => p.enabled)
        .filter(p => !allowedIds || allowedIds.includes(p.id));

      res.status(200).json({
        success: true,
        isAdmin: false,
        plans: vendorPlans,
        freeDailyLimit,
        freeUsageToday: todayCount,
        freeRemainingToday
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao listar planos.' });
    }
  } else if (req.method === 'POST') {
    if (!user.isAdmin && user.username.toLowerCase() !== 'gabriel') {
      res.status(403).json({ success: false, error: 'Apenas administradores podem configurar planos e preços.' });
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const { plans } = body;

      if (!Array.isArray(plans)) {
        res.status(400).json({ success: false, error: 'Formato inválido de planos.' });
        return;
      }

      // Sanitize plans
      const sanitized = plans.map(p => ({
        id: String(p.id),
        name: String(p.name),
        type: p.type || 'temporary',
        durationHours: p.durationHours !== undefined ? p.durationHours : null,
        price: typeof p.price === 'number' ? Math.max(0, p.price) : parseFloat(p.price) || 0.00,
        isFree: p.isFree !== undefined ? !!p.isFree : (parseFloat(p.price) <= 0),
        enabled: p.enabled !== undefined ? !!p.enabled : true
      }));

      await savePlans(sanitized);

      res.status(200).json({
        success: true,
        message: 'Planos e preços atualizados com sucesso!',
        plans: sanitized
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Erro ao salvar planos.' });
    }
  } else {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
};
