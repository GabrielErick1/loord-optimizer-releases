const { parseRequestBody, verifyClientSessionToken, getLicenses } = require('./_db');

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
    const { key, uuid, sessionToken, tweakId } = await parseRequestBody(req);

    if (!key || !uuid || !sessionToken) {
      res.status(401).json({
        success: false,
        error: 'Acesso negado: Credenciais e SessionToken requeridos para descriptografar funções críticas.'
      });
      return;
    }

    // 1. Validação Criptográfica do Token de Sessão assinado pela Vercel
    const sessionData = verifyClientSessionToken(sessionToken, uuid);
    if (!sessionData) {
      res.status(403).json({
        success: false,
        error: 'Sessão VIP inválida ou expirada. Inicie o aplicativo com uma licença oficial ativa.'
      });
      return;
    }

    // 2. Confirmação de status da licença no banco oficial
    const cleanKey = key.trim().toUpperCase();
    const cleanUuid = uuid.trim().toLowerCase();
    const licenses = await getLicenses();
    const license = licenses.find(l => l.key && l.key.toUpperCase() === cleanKey);

    if (!license || license.status === 'revoked' || (license.uuid && license.uuid.toLowerCase() !== cleanUuid)) {
      res.status(403).json({
        success: false,
        error: 'Acesso bloqueado: Licença revogada ou inválida para esta máquina.'
      });
      return;
    }

    // 3. Entrega Dinâmica de Cargas Críticas (O "Coração" do Produto na Nuvem)
    let payload = null;

    if (tweakId === 'semi-precision-curve') {
      // Curvas matemáticas calculadas na nuvem para estabilização de mira e capa perfeito
      payload = {
        type: 'mouse-curves',
        SmoothMouseXCurve: '0000000000000000156e000000000000004001000000000029dc0300000000000000280000000000',
        SmoothMouseYCurve: '0000000000000000fd11010000000000002404000000000000fc12000000000000c0bb0100000000',
        MouseSensitivity: '10',
        MouseSpeed: '0',
        MouseThreshold1: '0',
        MouseThreshold2: '0',
        MouseHoverTime: '0',
        MouseDataQueueSize: 32,
        KeyboardDataQueueSize: 32
      };
    } else if (tweakId === 'recoil-lock-stabilizer') {
      // Parâmetros de estabilização de FOV e redução de dispersão
      payload = {
        type: 'recoil-stabilizer',
        FovLock: 1,
        AimSensRatio: '1.0',
        StabilityMultiplier: '1.25',
        MouseQueuePriority: 1
      };
    } else if (tweakId === 'quantum-scheduler') {
      // Parâmetros quânticos de priorização de GPU e CPU para Free Fire e Emuladores
      payload = {
        type: 'scheduler',
        Win32PrioritySeparation: 38,
        IRQ8Priority: 1,
        SystemResponsiveness: 0,
        NetworkThrottlingIndex: 4294967295,
        GpuPriority: 8,
        Priority: 6,
        SchedulingCategory: 'High',
        SFIOPriority: 'High'
      };
    } else {
      // Carga genérica autorizada para a sessão
      payload = {
        authorized: true,
        licenseType: license.licenseType,
        serverSignature: Buffer.from(`${cleanKey}:${Date.now()}`).toString('base64')
      };
    }

    res.status(200).json({
      success: true,
      tweakId,
      payload,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Erro em vip-payload:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao descriptografar carga VIP.' });
  }
};
