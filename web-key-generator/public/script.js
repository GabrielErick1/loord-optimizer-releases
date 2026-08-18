const API_URL = ''; // Caminho relativo para funcionar na mesma URL da Vercel

// Elementos DOM
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const btnLogin = document.getElementById('btn-login');
const loginError = document.getElementById('login-error');

const displayUsername = document.getElementById('display-username');
const displayRole = document.getElementById('display-role');
const navUsers = document.getElementById('nav-users');
const navPlans = document.getElementById('nav-plans');
const btnLogout = document.getElementById('btn-logout');

const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Aba do Gerador de Keys
const clientNameInput = document.getElementById('client-name');
const clientUuidInput = document.getElementById('client-uuid');
const licenseTypeSelect = document.getElementById('license-type');
const customValContainer = document.getElementById('custom-val-container');
const customValLabel = document.getElementById('custom-val-label');
const customValInput = document.getElementById('custom-val');
const btnGenerate = document.getElementById('btn-generate');
const resultBox = document.getElementById('result-box');
const keyOutput = document.getElementById('key-output');
const resultDetails = document.getElementById('result-details');
const btnCopy = document.getElementById('btn-copy');
const vendorQuotaBanner = document.getElementById('vendor-quota-banner');
const quotaUsageText = document.getElementById('quota-usage-text');
const quotaStatusBadge = document.getElementById('quota-status-badge');

// Aba de Licenças
const licensesListBody = document.getElementById('licenses-list-body');
const btnRefreshLicenses = document.getElementById('btn-refresh-licenses');
const searchLicensesInput = document.getElementById('search-licenses');
const filterSellerSelect = document.getElementById('filter-seller');

// Aba de Gerenciamento de Usuários
const newUsernameInput = document.getElementById('new-username');
const newPasswordInput = document.getElementById('new-password');
const newIsAdminCheckbox = document.getElementById('new-is-admin');
const newFreeLimitInput = document.getElementById('new-free-limit');
const newVendorOptions = document.getElementById('new-vendor-options');
const newVendorPlansList = document.getElementById('new-vendor-plans-list');
const btnCreateUser = document.getElementById('btn-create-user');
const btnRefreshUsers = document.getElementById('btn-refresh-users');
const createUserError = document.getElementById('create-user-error');
const createUserSuccess = document.getElementById('create-user-success');
const usersListBody = document.getElementById('users-list-body');

// Aba de Planos & Preços (Admin)
const plansListBody = document.getElementById('plans-list-body');
const btnSavePlans = document.getElementById('btn-save-plans');
const plansSaveMsg = document.getElementById('plans-save-msg');

// Modal PIX Mercado Pago
const pixPaymentModal = document.getElementById('pix-payment-modal');
const pixPlanName = document.getElementById('pix-plan-name');
const pixPlanPrice = document.getElementById('pix-plan-price');
const pixQrImg = document.getElementById('pix-qr-img');
const pixCopyPasteInput = document.getElementById('pix-copy-paste-input');
const pixStatusBadge = document.getElementById('pix-status-badge');

let userToken = localStorage.getItem('admin_token');
let currentLoadedLicenses = [];
let currentLoadedUsers = [];
let currentLoadedPlans = [];
let activePixPollTimer = null;

// Helper para escapar HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Local cache storage helpers
function getLocalLicensesCache() {
  try { return JSON.parse(localStorage.getItem('admin_licenses_cache') || '[]'); } catch (e) { return []; }
}
function saveLocalLicensesCache(licenses) {
  try { localStorage.setItem('admin_licenses_cache', JSON.stringify(licenses)); } catch (e) {}
}

function getLocalUsersCache() {
  try { return JSON.parse(localStorage.getItem('admin_users_cache') || '[]'); } catch (e) { return []; }
}
function saveLocalUsersCache(users) {
  try { localStorage.setItem('admin_users_cache', JSON.stringify(users)); } catch (e) {}
}

// Navegação de Abas
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabName = item.getAttribute('data-tab');
    if (!tabName) return;

    navItems.forEach(i => i.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    item.classList.add('active');
    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.add('active');

    if (tabName === 'licenses') loadLicenses();
    if (tabName === 'users') loadUsers();
    if (tabName === 'plans') loadPlans();
    if (tabName === 'generator') loadPlans();
  });
});

// Ação de Login
btnLogin.addEventListener('click', async () => {
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value.trim();

  if (!username || !password) {
    loginError.textContent = '❌ Preencha todos os campos.';
    loginError.style.display = 'block';
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = 'Entrando...';
  loginError.style.display = 'none';

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      userToken = data.token;
      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_username', data.username);
      localStorage.setItem('admin_is_admin', data.isAdmin);

      initDashboard(data.username, data.isAdmin);
    } else {
      loginError.textContent = `❌ ${data.error || 'Credenciais inválidas.'}`;
      loginError.style.display = 'block';
    }
  } catch (e) {
    loginError.textContent = '❌ Erro de conexão com o servidor.';
    loginError.style.display = 'block';
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Entrar no Painel';
  }
});

// Ação de Logout
btnLogout.addEventListener('click', () => {
  userToken = null;
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_username');
  localStorage.removeItem('admin_is_admin');
  if (activePixPollTimer) clearInterval(activePixPollTimer);
  location.reload();
});

// Inicialização do Dashboard
function initDashboard(username, isAdmin) {
  loginContainer.style.display = 'none';
  dashboardContainer.style.display = 'flex';

  displayUsername.textContent = username;
  const isMaster = (username.toLowerCase() === 'gabriel') || isAdmin;
  displayRole.textContent = isMaster ? '👑 Administrador' : '👤 Vendedor';

  if (isMaster) {
    if (navUsers) navUsers.style.display = 'flex';
    if (navPlans) navPlans.style.display = 'flex';
  } else {
    if (navUsers) navUsers.style.display = 'none';
    if (navPlans) navPlans.style.display = 'none';
  }

  loadPlans();
  loadLicenses();
  if (isMaster) loadUsers();
}

// Auto-login se já tiver token
(async function checkExistingSession() {
  if (userToken) {
    const savedUser = localStorage.getItem('admin_username') || 'gabriel';
    const isMaster = (savedUser.toLowerCase() === 'gabriel') || localStorage.getItem('admin_is_admin') === 'true';
    initDashboard(savedUser, isMaster);
  }
})();

// Carregar Planos do Servidor
async function loadPlans() {
  if (!userToken) return;

  try {
    const res = await fetch(`${API_URL}/api/plans`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const data = await res.json();

    if (data.success && Array.isArray(data.plans)) {
      currentLoadedPlans = data.plans;

      // 1. Atualiza dropdown do gerador de keys
      renderPlanSelectOptions(data.plans);

      // 2. Atualiza quota do vendedor se aplicável
      if (!data.isAdmin && vendorQuotaBanner) {
        vendorQuotaBanner.style.display = 'flex';
        quotaUsageText.textContent = `${data.freeUsageToday || 0} de ${data.freeDailyLimit || 5} chaves de teste usadas`;
        quotaStatusBadge.textContent = `${data.freeRemainingToday || 0} Restantes Hoje`;
        quotaStatusBadge.style.background = (data.freeRemainingToday > 0) ? '#0284c7' : '#ef4444';
      } else if (vendorQuotaBanner) {
        vendorQuotaBanner.style.display = 'none';
      }

      // 3. Atualiza tabela de planos para o Admin
      if (data.isAdmin && plansListBody) {
        renderPlansAdminTable(data.plans);
      }

      // 4. Atualiza checkboxes de planos no form de cadastro de vendedor
      renderNewVendorPlanCheckboxes(data.plans);
    }
  } catch (e) {
    console.error('Erro ao carregar planos:', e);
  }
}

// Renderiza opções do Select no Gerador
function renderPlanSelectOptions(plans) {
  if (!licenseTypeSelect) return;
  const currentVal = licenseTypeSelect.value;
  licenseTypeSelect.innerHTML = '';

  plans.forEach(plan => {
    if (!plan.enabled) return;
    const opt = document.createElement('option');
    opt.value = plan.id;
    
    let priceLabel = 'Grátis';
    if (plan.price > 0) {
      priceLabel = `R$ ${Number(plan.price).toFixed(2).replace('.', ',')}`;
    }

    opt.textContent = `${plan.name} — [${priceLabel}]`;
    licenseTypeSelect.appendChild(opt);
  });

  if (currentVal && plans.some(p => p.id === currentVal && p.enabled)) {
    licenseTypeSelect.value = currentVal;
  }
}

// Exibir campo customizado quando selecionar personalizado
if (licenseTypeSelect) {
  licenseTypeSelect.addEventListener('change', () => {
    const val = licenseTypeSelect.value;
    if (val === 'temp-custom-hours') {
      customValContainer.style.display = 'block';
      customValLabel.textContent = 'Horas de Validade:';
      customValInput.placeholder = 'Ex: 3';
      customValInput.value = '3';
      customValInput.min = '1';
      customValInput.max = '8760';
    } else if (val === 'temp-custom-days') {
      customValContainer.style.display = 'block';
      customValLabel.textContent = 'Dias de Validade:';
      customValInput.placeholder = 'Ex: 45';
      customValInput.value = '45';
      customValInput.min = '1';
      customValInput.max = '365';
    } else {
      customValContainer.style.display = 'none';
    }
  });
}

// Renderiza Tabela de Planos para o Administrador
function renderPlansAdminTable(plans) {
  if (!plansListBody) return;
  plansListBody.innerHTML = '';

  plans.forEach(plan => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-plan-id', plan.id);

    const isChecked = plan.enabled ? 'checked' : '';
    const isFree = plan.price <= 0;

    let durationText = 'Vitalícia';
    if (plan.durationHours) {
      if (plan.durationHours >= 24 && plan.durationHours % 24 === 0) {
        durationText = `${plan.durationHours / 24} Dia(s)`;
      } else {
        durationText = `${plan.durationHours} Hora(s)`;
      }
    } else if (plan.id === 'temp-custom-hours') {
      durationText = 'Personalizada (Horas)';
    } else if (plan.id === 'temp-custom-days') {
      durationText = 'Personalizada (Dias)';
    }

    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="plan-toggle-active" ${isChecked} style="width: 18px; height: 18px; cursor: pointer;">
      </td>
      <td style="font-weight: 700; color: #f8fafc;">
        ${escapeHtml(plan.name)}
      </td>
      <td>
        <span style="font-size: 0.8rem; color: #94a3b8; font-family: monospace;">${escapeHtml(plan.id)}</span>
      </td>
      <td>
        <span style="background: rgba(255,255,255,0.06); padding: 4px 8px; border-radius: 6px; font-size: 0.85rem;">${durationText}</span>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="color: #94a3b8; font-size: 0.85rem;">R$</span>
          <input type="number" class="plan-price-input" step="0.01" min="0" value="${Number(plan.price || 0).toFixed(2)}" style="width: 90px; padding: 6px 10px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #00e676; font-weight: 700; font-size: 0.9rem;">
        </div>
      </td>
      <td>
        <span class="badge-cob" style="padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; background: ${isFree ? 'rgba(56,189,248,0.15)' : 'rgba(16,185,129,0.15)'}; color: ${isFree ? '#38bdf8' : '#10b981'};">
          ${isFree ? '🎁 Gratuita (Teste)' : '💳 Paga (PIX)'}
        </span>
      </td>
    `;
    plansListBody.appendChild(tr);
  });
}

// Salvar Tabela de Planos e Preços
if (btnSavePlans) {
  btnSavePlans.addEventListener('click', async () => {
    btnSavePlans.disabled = true;
    btnSavePlans.textContent = 'Salvando...';
    plansSaveMsg.textContent = '';

    const rows = plansListBody.querySelectorAll('tr[data-plan-id]');
    const updatedPlans = [];

    rows.forEach(tr => {
      const planId = tr.getAttribute('data-plan-id');
      const origPlan = currentLoadedPlans.find(p => p.id === planId) || {};
      const activeInput = tr.querySelector('.plan-toggle-active');
      const priceInput = tr.querySelector('.plan-price-input');

      const priceVal = Math.max(0, parseFloat(priceInput.value) || 0);
      const enabledVal = activeInput ? activeInput.checked : true;

      updatedPlans.push({
        ...origPlan,
        id: planId,
        price: priceVal,
        isFree: priceVal <= 0,
        enabled: enabledVal
      });
    });

    try {
      const res = await fetch(`${API_URL}/api/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ plans: updatedPlans })
      });
      const data = await res.json();

      if (data.success) {
        plansSaveMsg.style.color = '#10b981';
        plansSaveMsg.textContent = '✔️ Tabela de preços e status dos planos salva com sucesso!';
        currentLoadedPlans = data.plans;
        renderPlansAdminTable(data.plans);
        renderPlanSelectOptions(data.plans);
      } else {
        plansSaveMsg.style.color = '#ef4444';
        plansSaveMsg.textContent = `❌ ${data.error || 'Erro ao salvar planos.'}`;
      }
    } catch (e) {
      plansSaveMsg.style.color = '#ef4444';
      plansSaveMsg.textContent = '❌ Erro de conexão ao salvar planos.';
    } finally {
      btnSavePlans.disabled = false;
      btnSavePlans.textContent = '💾 Salvar Tabela de Preços';
    }
  });
}

// Renderiza Checkboxes de Planos para Novo Vendedor
function renderNewVendorPlanCheckboxes(plans) {
  if (!newVendorPlansList) return;
  newVendorPlansList.innerHTML = '';

  plans.forEach(p => {
    const isFree = p.price <= 0;
    const priceBadge = isFree 
      ? '<span class="plan-badge-free">🎁 Grátis</span>'
      : `<span class="plan-badge-price">💳 R$ ${Number(p.price).toFixed(2).replace('.', ',')}</span>`;

    const div = document.createElement('div');
    div.className = 'plan-checkbox-card';

    div.innerHTML = `
      <div class="plan-checkbox-left">
        <input type="checkbox" id="new-plan-${p.id}" value="${p.id}" checked>
        <label for="new-plan-${p.id}" class="plan-title-text" style="cursor: pointer; margin: 0;">
          ${escapeHtml(p.name)}
        </label>
      </div>
      ${priceBadge}
    `;

    // Toggle on container click
    div.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const cb = div.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
      }
      div.classList.toggle('checked', div.querySelector('input[type="checkbox"]').checked);
    });

    newVendorPlansList.appendChild(div);
  });
}

// Esconde opções de vendedor se marcar Administrador no cadastro
if (newIsAdminCheckbox) {
  newIsAdminCheckbox.addEventListener('change', () => {
    if (newIsAdminCheckbox.checked) {
      if (newVendorOptions) newVendorOptions.style.display = 'none';
    } else {
      if (newVendorOptions) newVendorOptions.style.display = 'block';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  GERAÇÃO DE CHAVE & CHECKOUT PIX MERCADO PAGO
// ═══════════════════════════════════════════════════════════════════════

btnGenerate.addEventListener('click', async () => {
  const uuid = clientUuidInput.value.trim();
  const clientName = clientNameInput.value.trim() || 'Cliente VIP';
  const typeVal = licenseTypeSelect.value;
  const customVal = customValInput ? parseInt(customValInput.value, 10) : 0;

  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Processando...';
  resultBox.style.display = 'none';

  try {
    const res = await fetch(`${API_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        uuid,
        clientName,
        licenseType: typeVal,
        customVal
      })
    });
    const data = await res.json();

    if (data.requirePayment) {
      // Plano pago para vendedor: Abre o checkout PIX Mercado Pago
      openPixModal({
        planId: data.planId,
        planName: data.planName,
        price: data.price,
        clientName,
        uuid,
        customVal
      });
      return;
    }

    if (data.success) {
      renderGeneratedKeyResult(data, typeVal, customVal);
      loadPlans(); // Atualiza quota
    } else {
      alert(`Aviso: ${data.error || 'Não foi possível gerar a chave.'}`);
    }
  } catch (e) {
    console.error(e);
    alert('Erro de conexão ao processar geração de chave.');
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.textContent = '⚡ Gerar Chave de Ativação';
  }
});

function renderGeneratedKeyResult(data, typeVal, customVal) {
  keyOutput.textContent = data.key;
  let typeLabel = data.licenseType;
  const plan = currentLoadedPlans.find(p => p.id === typeVal);
  if (plan) typeLabel = plan.name;

  resultDetails.innerHTML = `
    <strong>Cliente:</strong> ${escapeHtml(data.clientName)}<br>
    <strong>Tipo / Plano:</strong> ${escapeHtml(typeLabel)}<br>
    <strong>UUID Vinculado:</strong> ${data.uuid || 'Qualquer PC (Ativação Pendente)'}<br>
    <strong>Criado por:</strong> ${escapeHtml(localStorage.getItem('admin_username') || 'Você')}
  `;
  resultBox.style.display = 'block';

  loadLicenses();
}

// Abrir Modal de Pagamento PIX Mercado Pago
async function openPixModal(params) {
  pixPlanName.textContent = `Plano: ${params.planName}`;
  pixPlanPrice.textContent = `R$ ${Number(params.price).toFixed(2).replace('.', ',')}`;
  pixQrImg.src = '';
  pixCopyPasteInput.value = 'Gerando cobrança PIX...';
  pixStatusBadge.innerHTML = '<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#fbbf24; animation:pulse 1.5s infinite;"></span> Gerando QR Code no Mercado Pago...';
  pixPaymentModal.style.display = 'flex';

  try {
    const res = await fetch(`${API_URL}/api/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify(params)
    });
    const data = await res.json();

    if (data.success && data.paymentId) {
      if (data.qrCodeBase64) {
        pixQrImg.src = `data:image/png;base64,${data.qrCodeBase64}`;
      } else {
        pixQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrCode || '')}`;
      }

      pixCopyPasteInput.value = data.qrCode || 'Código não disponível';
      pixStatusBadge.innerHTML = '<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#fbbf24; animation:pulse 1.5s infinite;"></span> Aguardando pagamento via PIX...';

      // Inicia polling para detectar aprovação instantânea
      startPixPaymentPolling(data.paymentId, params);
    } else {
      alert(`Erro no Mercado Pago: ${data.error || 'Não foi possível gerar cobrança PIX.'}`);
      closePixModal();
    }
  } catch (e) {
    alert('Erro ao conectar com o Mercado Pago.');
    closePixModal();
  }
}

function startPixPaymentPolling(paymentId, params) {
  if (activePixPollTimer) clearInterval(activePixPollTimer);

  activePixPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_URL}/api/check-payment?paymentId=${paymentId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const data = await res.json();

      if (data.success && data.approved) {
        clearInterval(activePixPollTimer);
        pixStatusBadge.innerHTML = '🎉 <span style="color:#00e676;">Pagamento Aprovado! Chave gerada!</span>';
        
        setTimeout(() => {
          closePixModal();
          renderGeneratedKeyResult({
            key: data.key,
            clientName: data.clientName,
            licenseType: params.planName,
            uuid: params.uuid
          }, params.planId, params.customVal);
        }, 1200);
      }
    } catch (e) {}
  }, 2500);
}

function closePixModal() {
  if (activePixPollTimer) clearInterval(activePixPollTimer);
  pixPaymentModal.style.display = 'none';
}

function copyPixCode() {
  if (!pixCopyPasteInput.value) return;
  navigator.clipboard.writeText(pixCopyPasteInput.value).then(() => {
    const btn = document.getElementById('btn-copy-pix');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✔️ Copiado!';
      setTimeout(() => btn.textContent = orig, 2000);
    }
  });
}

// Botão Copiar Chave
if (btnCopy) {
  btnCopy.addEventListener('click', () => {
    const key = keyOutput.textContent;
    navigator.clipboard.writeText(key).then(() => {
      btnCopy.textContent = 'Copiado!';
      setTimeout(() => btnCopy.textContent = 'Copiar', 2000);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  ABA LICENÇAS & ATIVAÇÕES
// ═══════════════════════════════════════════════════════════════════════

async function loadLicenses() {
  if (!userToken) return;

  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const data = await res.json();

    if (data.success && Array.isArray(data.licenses)) {
      currentLoadedLicenses = data.licenses;
      saveLocalLicensesCache(data.licenses);
      renderLicensesTable(data.licenses);
      updateLicensesStats(data.licenses);
      populateSellerFilter(data.licenses);
    }
  } catch (e) {
    const cached = getLocalLicensesCache();
    if (cached.length > 0) {
      currentLoadedLicenses = cached;
      renderLicensesTable(cached);
      updateLicensesStats(cached);
    }
  }
}

function updateLicensesStats(licenses) {
  const total = licenses.length;
  let active = 0, pending = 0, revoked = 0;

  licenses.forEach(l => {
    if (l.status === 'revoked') revoked++;
    else if (l.status === 'pending') pending++;
    else if (l.status === 'activated') {
      if (l.licenseType === 'temporary' && l.expiresAt && Date.now() > l.expiresAt) revoked++;
      else active++;
    }
  });

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-revoked').textContent = revoked;
}

function populateSellerFilter(licenses) {
  if (!filterSellerSelect) return;
  const currentVal = filterSellerSelect.value;
  const sellers = Array.from(new Set(licenses.map(l => l.createdBy || 'Sistema'))).sort();

  filterSellerSelect.innerHTML = '<option value="">👤 Todos os Vendedores</option>';
  sellers.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = `👤 ${s}`;
    filterSellerSelect.appendChild(opt);
  });
  filterSellerSelect.value = currentVal;
}

function renderLicensesTable(licenses) {
  if (!licensesListBody) return;
  licensesListBody.innerHTML = '';

  const search = searchLicensesInput ? searchLicensesInput.value.toLowerCase().trim() : '';
  const seller = filterSellerSelect ? filterSellerSelect.value : '';

  const filtered = licenses.filter(l => {
    const matchesSearch = !search || 
      (l.clientName && l.clientName.toLowerCase().includes(search)) ||
      (l.key && l.key.toLowerCase().includes(search)) ||
      (l.uuid && l.uuid.toLowerCase().includes(search));

    const matchesSeller = !seller || (l.createdBy === seller);
    return matchesSearch && matchesSeller;
  });

  if (filtered.length === 0) {
    licensesListBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 25px;">Nenhuma licença encontrada.</td></tr>';
    return;
  }

  filtered.forEach(l => {
    const tr = document.createElement('tr');

    let statusHtml = '<span class="status-badge status-pending">Pendente</span>';
    if (l.status === 'revoked') {
      statusHtml = '<span class="status-badge status-revoked">Revogado</span>';
    } else if (l.status === 'activated') {
      if (l.licenseType === 'temporary' && l.expiresAt && Date.now() > l.expiresAt) {
        statusHtml = '<span class="status-badge status-revoked">Expirado</span>';
      } else {
        statusHtml = '<span class="status-badge status-active">🟢 Ativo</span>';
      }
    }

    let validityHtml = '<span style="color: #64748b;">—</span>';
    if (l.licenseType === 'temporary' && l.expiresAt) {
      const diffMs = l.expiresAt - Date.now();
      if (diffMs > 0) {
        const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
        const daysLeft = Math.floor(hoursLeft / 24);
        if (daysLeft >= 1) {
          validityHtml = `<span style="color:#38bdf8; font-weight:700;">${daysLeft}d restantes</span>`;
        } else {
          validityHtml = `<span style="color:#fbbf24; font-weight:700;">${hoursLeft}h restantes</span>`;
        }
      } else {
        validityHtml = '<span style="color:#ef4444; font-weight:700;">Expirado</span>';
      }
    } else if (l.licenseType === 'temporary' && !l.expiresAt) {
      const hours = l.durationHours || 720;
      validityHtml = `<span style="color:#94a3b8;">${hours >= 24 ? Math.round(hours / 24) + 'd' : hours + 'h'} (após ativação)</span>`;
    } else {
      validityHtml = '<span style="color:#a855f7; font-weight:700;">👑 Vitalícia</span>';
    }

    tr.innerHTML = `
      <td style="font-weight: 700; color: #f8fafc;">${escapeHtml(l.clientName || 'Cliente VIP')}</td>
      <td><span style="font-size: 0.8rem; color: #cbd5e1;">${l.licenseType === 'temporary' ? '⏳ Temp' : '👑 Vitalícia'}</span></td>
      <td><span style="font-size: 0.8rem; color: #38bdf8;">${escapeHtml(l.createdBy || 'Sistema')}</span></td>
      <td style="font-family: monospace; font-size: 0.8rem; color: #94a3b8;">${l.uuid ? escapeHtml(l.uuid.substring(0, 12)) + '...' : '<span style="color:#64748b;">Avulsa</span>'}</td>
      <td style="font-family: monospace; font-size: 0.85rem; font-weight: 700; color: #e2e8f0;">${escapeHtml(l.key)}</td>
      <td>${statusHtml}</td>
      <td style="font-size: 0.8rem; color: #64748b;">${l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${validityHtml}</td>
      <td>
        <button onclick="deleteLicense('${escapeHtml(l.key)}')" class="btn-action" style="color: #ef4444;" title="Excluir Chave">🗑️</button>
      </td>
    `;
    licensesListBody.appendChild(tr);
  });
}

// Excluir Licença
window.deleteLicense = async function(key) {
  if (!confirm(`Deseja realmente excluir e revogar a chave ${key}?`)) return;

  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (data.success) {
      loadLicenses();
    } else {
      alert(`Erro: ${data.error || 'Não foi possível excluir a licença.'}`);
    }
  } catch (e) {
    alert('Erro ao excluir licença.');
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  ABA USUÁRIOS & VENDEDORES
// ═══════════════════════════════════════════════════════════════════════

async function loadUsers() {
  if (!userToken) return;

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const data = await res.json();

    if (data.success && Array.isArray(data.users)) {
      currentLoadedUsers = data.users;
      saveLocalUsersCache(data.users);
      renderUsersTable(data.users);
    }
  } catch (e) {
    const cached = getLocalUsersCache();
    if (cached.length > 0) {
      currentLoadedUsers = cached;
      renderUsersTable(cached);
    }
  }
}

function renderUsersTable(users) {
  if (!usersListBody) return;
  usersListBody.innerHTML = '';

  if (users.length === 0) {
    usersListBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 25px;">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  users.forEach(u => {
    const tr = document.createElement('tr');
    const isMaster = u.username.toLowerCase() === 'gabriel';
    const statusLabel = u.status === 'inactive' ? '<span style="color:#ef4444; font-weight:700;">Inativo</span>' : '<span style="color:#10b981; font-weight:700;">🟢 Ativo</span>';

    const roleBadge = u.isAdmin 
      ? '<span style="background: rgba(99,102,241,0.15); color: #818cf8; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 0.8rem;">👑 Admin</span>'
      : '<span style="background: rgba(56,189,248,0.15); color: #38bdf8; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 0.8rem;">👤 Vendedor</span>';

    const limitLabel = u.isAdmin ? '<span style="color:#64748b;">Ilimitado</span>' : `<strong>${u.freeUsageToday || 0} / ${u.freeDailyLimit || 5}</strong> hoje`;

    tr.innerHTML = `
      <td style="font-weight: 700; color: #f8fafc;">${escapeHtml(u.username)}</td>
      <td>${roleBadge}</td>
      <td>${statusLabel}</td>
      <td style="font-size: 0.85rem; color: #e2e8f0;">${limitLabel}</td>
      <td><span style="font-weight: 700; color: #38bdf8;">${u.totalKeys || 0}</span> keys</td>
      <td style="font-size: 0.8rem; color: #64748b;">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
      <td>
        <button onclick="openEditUserModal('${escapeHtml(u.username)}')" class="btn-action" title="Editar Usuário" style="color:#818cf8; margin-right:4px;">✏️</button>
        ${!isMaster ? `
          <button onclick="toggleUserStatus('${escapeHtml(u.username)}')" class="btn-action" title="Ativar/Inativar" style="color:#fbbf24; margin-right:4px;">🔄</button>
          <button onclick="deleteUser('${escapeHtml(u.username)}')" class="btn-action" title="Excluir Usuário" style="color:#ef4444;">🗑️</button>
        ` : ''}
      </td>
    `;
    usersListBody.appendChild(tr);
  });
}

// Cadastrar Novo Usuário / Vendedor
if (btnCreateUser) {
  btnCreateUser.addEventListener('click', async () => {
    const newUsername = newUsernameInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const newIsAdmin = newIsAdminCheckbox.checked;
    const freeDailyLimit = parseInt(newFreeLimitInput.value, 10) || 5;

    createUserError.style.display = 'none';
    createUserSuccess.style.display = 'none';

    if (!newUsername || !newPassword) {
      createUserError.textContent = '❌ Preencha o usuário e a senha.';
      createUserError.style.display = 'block';
      return;
    }

    // Coleta planos permitidos selecionados
    const allowedPlans = [];
    if (!newIsAdmin && newVendorPlansList) {
      const checkedBoxes = newVendorPlansList.querySelectorAll('input[type="checkbox"]:checked');
      checkedBoxes.forEach(cb => allowedPlans.push(cb.value));
    }

    btnCreateUser.disabled = true;
    btnCreateUser.textContent = 'Cadastrando...';

    try {
      const res = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          newUsername,
          newPassword,
          newIsAdmin,
          allowedPlans,
          freeDailyLimit
        })
      });
      const data = await res.json();

      if (data.success) {
        createUserSuccess.textContent = `✔️ Usuário "${newUsername}" cadastrado com sucesso!`;
        createUserSuccess.style.display = 'block';
        newUsernameInput.value = '';
        newPasswordInput.value = '';
        newIsAdminCheckbox.checked = false;
        if (newVendorOptions) newVendorOptions.style.display = 'block';
        loadUsers();
      } else {
        createUserError.textContent = `❌ ${data.error || 'Erro ao cadastrar usuário.'}`;
        createUserError.style.display = 'block';
      }
    } catch (e) {
      createUserError.textContent = '❌ Erro ao conectar com o servidor.';
      createUserError.style.display = 'block';
    } finally {
      btnCreateUser.disabled = false;
      btnCreateUser.textContent = '➕ Cadastrar Usuário';
    }
  });
}

// Modal de Edição de Usuário
let editingUsername = null;
let editingIsAdmin = false;

window.openEditUserModal = function(username) {
  const user = currentLoadedUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return;

  editingUsername = user.username;
  editingIsAdmin = !!user.isAdmin;

  document.getElementById('edit-modal-username-label').textContent = `Editando: ${user.username}`;
  document.getElementById('edit-modal-new-password').value = '';
  document.getElementById('edit-modal-msg').textContent = '';

  const editVendorOptions = document.getElementById('edit-vendor-options');
  const editFreeLimitInput = document.getElementById('edit-modal-free-limit');
  const editPlansList = document.getElementById('edit-modal-plans-list');

  editFreeLimitInput.value = typeof user.freeDailyLimit === 'number' ? user.freeDailyLimit : 5;

  // Renderiza checkboxes de planos permitidos
  editPlansList.innerHTML = '';
  currentLoadedPlans.forEach(p => {
    const isAllowed = !user.allowedPlans || user.allowedPlans.length === 0 || user.allowedPlans.includes(p.id);
    const isFree = p.price <= 0;
    const priceBadge = isFree 
      ? '<span class="plan-badge-free">🎁 Grátis</span>'
      : `<span class="plan-badge-price">💳 R$ ${Number(p.price).toFixed(2).replace('.', ',')}</span>`;

    const div = document.createElement('div');
    div.className = `plan-checkbox-card ${isAllowed ? 'checked' : ''}`;

    div.innerHTML = `
      <div class="plan-checkbox-left">
        <input type="checkbox" id="edit-plan-${p.id}" value="${p.id}" ${isAllowed ? 'checked' : ''}>
        <label for="edit-plan-${p.id}" class="plan-title-text" style="cursor: pointer; margin: 0;">
          ${escapeHtml(p.name)}
        </label>
      </div>
      ${priceBadge}
    `;

    div.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const cb = div.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
      }
      div.classList.toggle('checked', div.querySelector('input[type="checkbox"]').checked);
    });

    editPlansList.appendChild(div);
  });

  setModalRole(editingIsAdmin);
  document.getElementById('edit-user-modal').style.display = 'flex';
};

window.setModalRole = function(isAdmin) {
  editingIsAdmin = isAdmin;
  const btnVendedor = document.getElementById('btn-role-vendedor');
  const btnAdmin = document.getElementById('btn-role-admin');
  const editVendorOptions = document.getElementById('edit-vendor-options');

  if (isAdmin) {
    btnAdmin.style.border = '2px solid #818cf8';
    btnAdmin.style.background = 'rgba(99,102,241,0.25)';
    btnVendedor.style.border = '2px solid transparent';
    btnVendedor.style.background = 'rgba(56,189,248,0.06)';
    if (editVendorOptions) editVendorOptions.style.display = 'none';
  } else {
    btnVendedor.style.border = '2px solid #38bdf8';
    btnVendedor.style.background = 'rgba(56,189,248,0.25)';
    btnAdmin.style.border = '2px solid transparent';
    btnAdmin.style.background = 'rgba(99,102,241,0.06)';
    if (editVendorOptions) editVendorOptions.style.display = 'block';
  }
};

window.closeEditModal = function() {
  document.getElementById('edit-user-modal').style.display = 'none';
};

window.saveUserEdit = async function() {
  const newPassword = document.getElementById('edit-modal-new-password').value.trim();
  const freeDailyLimit = parseInt(document.getElementById('edit-modal-free-limit').value, 10) || 5;
  const msgEl = document.getElementById('edit-modal-msg');
  const saveBtn = document.getElementById('btn-save-edit');

  const allowedPlans = [];
  const checkedBoxes = document.getElementById('edit-modal-plans-list').querySelectorAll('input[type="checkbox"]:checked');
  checkedBoxes.forEach(cb => allowedPlans.push(cb.value));

  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        action: 'edit-user',
        usernameToUpdate: editingUsername,
        newIsAdmin: editingIsAdmin,
        newPassword: newPassword || undefined,
        allowedPlans,
        freeDailyLimit
      })
    });
    const data = await res.json();

    if (data.success) {
      msgEl.style.color = '#10b981';
      msgEl.textContent = '✔️ Usuário atualizado com sucesso!';
      loadUsers();
      setTimeout(closeEditModal, 1000);
    } else {
      msgEl.style.color = '#ef4444';
      msgEl.textContent = `❌ ${data.error || 'Erro ao atualizar.'}`;
    }
  } catch (e) {
    msgEl.style.color = '#ef4444';
    msgEl.textContent = '❌ Erro de conexão ao salvar.';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Salvar Alterações';
  }
};

window.toggleUserStatus = async function(username) {
  try {
    const res = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        action: 'toggle-status',
        usernameToToggle: username
      })
    });
    const data = await res.json();
    if (data.success) loadUsers();
  } catch (e) {}
};

window.deleteUser = async function(username) {
  if (!confirm(`Deseja realmente remover o usuário "${username}"?`)) return;

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ usernameToDelete: username })
    });
    const data = await res.json();
    if (data.success) loadUsers();
    else alert(`Erro: ${data.error || 'Não foi possível excluir o usuário.'}`);
  } catch (e) {
    alert('Erro ao excluir usuário.');
  }
};

// Listeners auxiliares
if (btnRefreshLicenses) btnRefreshLicenses.addEventListener('click', loadLicenses);
if (btnRefreshUsers) btnRefreshUsers.addEventListener('click', loadUsers);
if (searchLicensesInput) searchLicensesInput.addEventListener('input', () => renderLicensesTable(currentLoadedLicenses));
if (filterSellerSelect) filterSellerSelect.addEventListener('change', () => renderLicensesTable(currentLoadedLicenses));
