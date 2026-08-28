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
const newFreeLimitInput = document.getElementById('new-free-limit');
const newVendorOptions = document.getElementById('new-vendor-options');
const newVendorPlansList = document.getElementById('new-vendor-plans-list');
const btnCreateUser = document.getElementById('btn-create-user');
const btnRefreshUsers = document.getElementById('btn-refresh-users');
const createUserError = document.getElementById('create-user-error');
const createUserSuccess = document.getElementById('create-user-success');
const usersListBody = document.getElementById('users-list-body');

// Seletores de Cargo e Liberação
const containerRoleSelector = document.getElementById('container-role-selector');
const containerDirectToggle = document.getElementById('container-direct-toggle');
const lblRoleVendedor = document.getElementById('lbl-role-vendedor');
const lblRoleAdmin = document.getElementById('lbl-role-admin');
const lblRoleOwner = document.getElementById('lbl-role-owner');
const roleAdminNotice = document.getElementById('role-admin-notice');
const newAllDirect = document.getElementById('new-all-direct');
const editModalAllDirect = document.getElementById('edit-modal-all-direct');

// Aba de Planos & Preços (Owner/Admin)
const plansListBody = document.getElementById('plans-list-body');
const btnSavePlans = document.getElementById('btn-save-plans');
const plansSaveMsg = document.getElementById('plans-save-msg');

// Aba de Aprovações (Owner)
const navApprovals = document.getElementById('nav-approvals');
const badgePendingCount = document.getElementById('badge-pending-count');
const btnRefreshApprovals = document.getElementById('btn-refresh-approvals');
const approvalsKeysBody = document.getElementById('approvals-keys-body');
const approvalsUsersBody = document.getElementById('approvals-users-body');
const statApprovalsTotal = document.getElementById('stat-approvals-total');
const statApprovalsKeys = document.getElementById('stat-approvals-keys');
const statApprovalsUsers = document.getElementById('stat-approvals-users');
const statApprovalsDone = document.getElementById('stat-approvals-done');

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
let currentLoadedApprovals = [];
let activePixPollTimer = null;
let currentNewUserRole = 'vendedor';

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
    if (tabName === 'approvals') loadApprovals();
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
      localStorage.setItem('admin_role', data.role || (data.isAdmin ? 'admin' : 'vendedor'));

      initDashboard(data.username, data.isAdmin, data.role);
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
  localStorage.removeItem('admin_role');
  if (activePixPollTimer) clearInterval(activePixPollTimer);
  location.reload();
});

// Inicialização do Dashboard
function initDashboard(username, isAdmin, role) {
  loginContainer.style.display = 'none';
  dashboardContainer.style.display = 'flex';

  displayUsername.textContent = username;
  const userRole = role || localStorage.getItem('admin_role') || (username.toLowerCase() === 'gabriel' ? 'worn' : (isAdmin ? 'admin' : 'vendedor'));
  localStorage.setItem('admin_role', userRole);

  const isWorn = userRole === 'worn' || userRole === 'owner' || username.toLowerCase() === 'gabriel';

  if (isWorn) {
    displayRole.textContent = '👑 Worn';
    displayRole.style.color = '#f59e0b';
    if (navUsers) navUsers.style.display = 'flex';
    if (navPlans) navPlans.style.display = 'flex';
    if (navApprovals) navApprovals.style.display = 'flex';
    if (containerRoleSelector) containerRoleSelector.style.display = 'block';
    if (containerDirectToggle) containerDirectToggle.style.display = 'block';
    if (lblRoleAdmin) lblRoleAdmin.style.display = 'flex';
    if (lblRoleOwner) lblRoleOwner.style.display = 'flex';
    if (roleAdminNotice) roleAdminNotice.style.display = 'none';
    setNewUserRoleSelection('vendedor');
    loadApprovals();
  } else if (userRole === 'admin') {
    displayRole.textContent = '🛡️ Administrador';
    displayRole.style.color = '#818cf8';
    if (navUsers) navUsers.style.display = 'flex';
    if (navPlans) navPlans.style.display = 'none';
    if (navApprovals) navApprovals.style.display = 'none';
    // Na imagem 2: Administradores NÃO veem o seletor de cargo nem liberação direta
    if (containerRoleSelector) containerRoleSelector.style.display = 'none';
    if (containerDirectToggle) containerDirectToggle.style.display = 'none';
    if (lblRoleAdmin) lblRoleAdmin.style.display = 'none';
    if (lblRoleOwner) lblRoleOwner.style.display = 'none';
    if (roleAdminNotice) roleAdminNotice.style.display = 'block';
    setNewUserRoleSelection('vendedor');
  } else {
    displayRole.textContent = '👤 Vendedor';
    displayRole.style.color = '#38bdf8';
    if (navUsers) navUsers.style.display = 'none';
    if (navPlans) navPlans.style.display = 'none';
    if (navApprovals) navApprovals.style.display = 'none';
    if (containerRoleSelector) containerRoleSelector.style.display = 'none';
    if (containerDirectToggle) containerDirectToggle.style.display = 'none';
  }

  loadPlans();
  loadLicenses();
  if (isWorn || userRole === 'admin') loadUsers();
}

// Auto-login se já tiver token
(async function checkExistingSession() {
  if (userToken) {
    const savedUser = localStorage.getItem('admin_username') || 'gabriel';
    const isMaster = (savedUser.toLowerCase() === 'gabriel') || localStorage.getItem('admin_is_admin') === 'true';
    const savedRole = (savedUser.toLowerCase() === 'gabriel') ? 'worn' : (localStorage.getItem('admin_role') || (isMaster ? 'admin' : 'vendedor'));
    initDashboard(savedUser, isMaster, savedRole);
  }
})();

// Seletor de Cargo no Formulário de Cadastro
function setNewUserRoleSelection(role) {
  currentNewUserRole = role;
  const radio = document.querySelector(`input[name="new-user-role"][value="${role}"]`);
  if (radio) radio.checked = true;

  const items = [
    { id: 'lbl-role-vendedor', active: role === 'vendedor', border: '#0284c7', bg: 'rgba(56, 189, 248, 0.15)' },
    { id: 'lbl-role-admin', active: role === 'admin', border: '#818cf8', bg: 'rgba(99, 102, 241, 0.15)' },
    { id: 'lbl-role-owner', active: role === 'owner', border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' }
  ];

  items.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      el.style.border = item.active ? `2px solid ${item.border}` : '2px solid transparent';
      el.style.background = item.active ? item.bg : 'rgba(255, 255, 255, 0.04)';
    }
  });

  if (newAllDirect) {
    // Owners e Admins por padrão têm liberação direta marcada, vendedores desmarcada
    newAllDirect.checked = (role === 'owner' || role === 'admin');
  }
}

if (lblRoleVendedor) lblRoleVendedor.addEventListener('click', () => setNewUserRoleSelection('vendedor'));
if (lblRoleAdmin) lblRoleAdmin.addEventListener('click', () => setNewUserRoleSelection('admin'));
if (lblRoleOwner) lblRoleOwner.addEventListener('click', () => setNewUserRoleSelection('owner'));

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
      if (plan.id === 'temp-custom-days') {
        priceLabel = `R$ ${Number(plan.price).toFixed(2).replace('.', ',')} / dia`;
      } else if (plan.id === 'temp-custom-hours') {
        priceLabel = `R$ ${Number(plan.price).toFixed(2).replace('.', ',')} / hora`;
      } else {
        priceLabel = `R$ ${Number(plan.price).toFixed(2).replace('.', ',')}`;
      }
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
      durationText = 'Personalizada (R$ / hora)';
    } else if (plan.id === 'temp-custom-days') {
      durationText = 'Personalizada (R$ / dia)';
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

  // Verificação prévia no cache de licenças carregadas
  if (uuid && uuid.length >= 5 && Array.isArray(currentLoadedLicenses)) {
    const existing = currentLoadedLicenses.find(l => l.uuid && l.uuid.toLowerCase() === uuid.toLowerCase());
    if (existing) {
      alert(`⚠️ UUID JÁ CADASTRADO!\n\nEste UUID (${uuid}) já pertence ao cliente "${existing.clientName || 'Cliente'}" (Chave: ${existing.key || 'Ativa'}).\n\n👉 Para estender o acesso, vá na aba "Chaves Ativas" e clique em "Renovar", ou informe outro UUID.`);
      return;
    }
  }

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

    if (data.pendingApproval) {
      keyOutput.textContent = '⏳ AGUARDANDO APROVAÇÃO';
      keyOutput.style.color = '#f59e0b';
      const resultTitle = resultBox.querySelector('#result-title') || resultBox.querySelector('h3');
      if (resultTitle) resultTitle.textContent = 'Solicitação Enviada com Sucesso!';
      resultDetails.innerHTML = `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 8px; padding: 12px; margin-top: 8px;">
          <strong style="color: #fbbf24; font-size: 0.95rem;">⏳ Aguardando Autorização do Owner</strong>
          <p style="margin: 6px 0 0 0; font-size: 0.84rem; color: #fde68a;">${escapeHtml(data.message)}</p>
          <p style="margin: 6px 0 0 0; font-size: 0.78rem; color: #94a3b8;"><strong>Cliente:</strong> ${escapeHtml(data.clientName || clientName)} | <strong>Plano:</strong> ${escapeHtml(data.planName)}</p>
        </div>
      `;
      resultBox.style.display = 'block';
      loadPlans();
      return;
    }

    if (data.success) {
      renderGeneratedKeyResult(data, typeVal, customVal);
      loadPlans(); // Atualiza quota
    } else {
      alert(data.error || 'Não foi possível gerar a chave.');
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
  keyOutput.style.color = '';
  const resultTitle = resultBox.querySelector('#result-title') || resultBox.querySelector('h3');
  if (resultTitle) resultTitle.textContent = 'Chave Gerada com Sucesso!';
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
    const isExpired = l.licenseType === 'temporary' && l.expiresAt && Date.now() >= l.expiresAt;
    if (l.status === 'revoked' || isExpired) {
      revoked++;
    } else if (l.status === 'pending') {
      pending++;
    } else if (l.status === 'activated') {
      active++;
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

    const isExpired = (l.licenseType === 'temporary' && l.expiresAt && (Date.now() >= l.expiresAt));

    let statusHtml = '<span class="status-badge status-pending">Pendente</span>';
    if (l.status === 'revoked') {
      statusHtml = '<span class="status-badge status-revoked">Revogado</span>';
    } else if (isExpired) {
      statusHtml = '<span class="status-badge status-revoked">Expirado</span>';
    } else if (l.status === 'activated') {
      statusHtml = '<span class="status-badge status-active">🟢 Ativo</span>';
    }

    let validityHtml = '<span style="color: #64748b;">—</span>';
    if (l.licenseType === 'temporary' && l.expiresAt) {
      const diffMs = l.expiresAt - Date.now();
      if (diffMs > 0) {
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        const hoursLeft = Math.floor(totalMinutes / 60);
        const daysLeft = Math.floor(hoursLeft / 24);

        if (daysLeft >= 1) {
          validityHtml = `<span style="color:#38bdf8; font-weight:700;">${daysLeft}d restantes</span>`;
        } else if (hoursLeft >= 1) {
          const remMin = totalMinutes % 60;
          validityHtml = `<span style="color:#fbbf24; font-weight:700;">${hoursLeft}h ${remMin > 0 ? remMin + 'm' : ''} restantes</span>`;
        } else if (totalMinutes > 0) {
          validityHtml = `<span style="color:#f97316; font-weight:700;">${totalMinutes}min restantes</span>`;
        } else {
          validityHtml = `<span style="color:#ef4444; font-weight:700;">Expirando agora</span>`;
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

    const isRevoked = l.status === 'revoked';
    const hasUuid = !!(l.uuid && l.uuid.trim().length > 3);

    tr.innerHTML = `
      <td style="font-weight: 700; color: #f8fafc;">${escapeHtml(l.clientName || 'Cliente VIP')}</td>
      <td><span style="font-size: 0.8rem; color: #cbd5e1;">${l.licenseType === 'temporary' ? '⏳ Temp' : '👑 Vitalícia'}</span></td>
      <td><span style="font-size: 0.8rem; color: #38bdf8;">${escapeHtml(l.createdBy || 'Sistema')}</span></td>
      <td style="font-family: monospace; font-size: 0.8rem; color: #94a3b8;">${l.uuid ? escapeHtml(l.uuid.substring(0, 12)) + '...' : '<span style="color:#64748b;">Avulsa</span>'}</td>
      <td style="font-family: monospace; font-size: 0.85rem; font-weight: 700; color: #e2e8f0;">${escapeHtml(l.key)}</td>
      <td>${statusHtml}</td>
      <td style="font-size: 0.8rem; color: #64748b;">${l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${validityHtml}</td>
      <td style="white-space: nowrap;">
        <button onclick="openRenewModal('${escapeHtml(l.key)}')" class="btn-action" title="Renovar Validade da Chave" style="color: #38bdf8; margin-right: 4px;">🔄</button>
        ${hasUuid ? `<button onclick="resetLicenseUuid('${escapeHtml(l.key)}')" class="btn-action" title="Deslogar PC (Desvincular UUID)" style="color: #fbbf24; margin-right: 4px;">🔌</button>` : ''}
        <button onclick="toggleRevokeLicense('${escapeHtml(l.key)}')" class="btn-action" title="${isRevoked ? 'Reativar Chave' : 'Revogar / Bloquear Chave'}" style="color: ${isRevoked ? '#10b981' : '#f59e0b'}; margin-right: 4px;">${isRevoked ? '🟢' : '⛔'}</button>
        <button onclick="deleteLicense('${escapeHtml(l.key)}')" class="btn-action" title="Excluir Chave Permanentemente" style="color: #ef4444;">🗑️</button>
      </td>
    `;
    licensesListBody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  AÇÕES DE LICENÇA (RENOVAR, DESLOGAR PC, REVOGAR, EXCLUIR)
// ═══════════════════════════════════════════════════════════════════════

// 1. Abrir Modal de Renovação de Licença
let renewingKey = null;

window.openRenewModal = function(key) {
  const lic = currentLoadedLicenses.find(l => l.key.toUpperCase() === key.toUpperCase());
  if (!lic) return;

  renewingKey = lic.key;
  document.getElementById('renew-modal-key-label').textContent = `Chave: ${lic.key} | Cliente: ${lic.clientName || 'Cliente VIP'}`;
  document.getElementById('renew-modal-msg').textContent = '';

  const renewSelect = document.getElementById('renew-license-type');
  if (renewSelect) {
    renewSelect.innerHTML = '';
    currentLoadedPlans.forEach(plan => {
      if (!plan.enabled) return;
      const opt = document.createElement('option');
      opt.value = plan.id;
      opt.textContent = `${plan.name}`;
      renewSelect.appendChild(opt);
    });
  }

  document.getElementById('renew-license-modal').style.display = 'flex';
};

window.closeRenewModal = function() {
  document.getElementById('renew-license-modal').style.display = 'none';
  renewingKey = null;
};

window.confirmRenew = async function() {
  if (!renewingKey) return;
  const renewSelect = document.getElementById('renew-license-type');
  const licenseType = renewSelect ? renewSelect.value : 'temp-30d';
  const customValInput = document.getElementById('renew-custom-val');
  const customVal = customValInput ? parseInt(customValInput.value, 10) : 30;
  const msgEl = document.getElementById('renew-modal-msg');
  const confirmBtn = document.getElementById('btn-confirm-renew');

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Renovando...';

  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        key: renewingKey,
        licenseType,
        customVal
      })
    });
    const data = await res.json();

    if (data.success) {
      msgEl.style.color = '#10b981';
      msgEl.textContent = '✔️ Licença renovada com sucesso!';
      loadLicenses();
      setTimeout(closeRenewModal, 1200);
    } else {
      msgEl.style.color = '#ef4444';
      msgEl.textContent = `❌ ${data.error || 'Erro ao renovar.'}`;
    }
  } catch (e) {
    msgEl.style.color = '#ef4444';
    msgEl.textContent = '❌ Erro de conexão ao renovar.';
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '🔄 Confirmar Renovação';
  }
};

// 2. Deslogar PC (Desvincular UUID)
window.resetLicenseUuid = async function(key) {
  if (!confirm(`Deseja realmente deslogar o PC e desvincular o UUID da chave ${key}?\nO cliente precisará ativar novamente no próximo uso.`)) return;

  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ key, action: 'unlink' })
    });
    const data = await res.json();
    if (data.success) {
      loadLicenses();
    } else {
      alert(`Erro: ${data.error || 'Não foi possível desvincular o PC.'}`);
    }
  } catch (e) {
    alert('Erro ao desvincular PC.');
  }
};

// 3. Revogar / Desativar / Reativar Chave
window.toggleRevokeLicense = async function(key) {
  const lic = currentLoadedLicenses.find(l => l.key.toUpperCase() === key.toUpperCase());
  const isRevoked = lic && lic.status === 'revoked';
  const actionText = isRevoked ? 'reativar' : 'revogar/bloquear';

  if (!confirm(`Deseja realmente ${actionText} a chave ${key}?`)) return;

  try {
    if (isRevoked) {
      // Reativar via PATCH
      const res = await fetch(`${API_URL}/api/licenses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ key, licenseType: lic.licenseType || 'permanent-unlimited' })
      });
      const data = await res.json();
      if (data.success) loadLicenses();
      else alert(`Erro: ${data.error || 'Não foi possível reativar.'}`);
    } else {
      // Revogar via DELETE default
      const res = await fetch(`${API_URL}/api/licenses`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ key, action: 'revoke' })
      });
      const data = await res.json();
      if (data.success) loadLicenses();
      else alert(`Erro: ${data.error || 'Não foi possível revogar.'}`);
    }
  } catch (e) {
    alert('Erro ao alterar status da chave.');
  }
};

// 4. Excluir Chave Permanentemente
window.deleteLicense = async function(key) {
  if (!confirm(`Deseja realmente EXCLUIR PERMANENTEMENTE a chave ${key}?\nEsta ação não poderá ser desfeita.`)) return;

  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ key, action: 'delete' })
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

  const myUsername = (localStorage.getItem('admin_username') || '').toLowerCase();
  const myRole = (myUsername === 'gabriel') ? 'worn' : (localStorage.getItem('admin_role') || 'vendedor');
  const isOwner = myRole === 'worn' || myRole === 'owner' || myUsername === 'gabriel';

  users.forEach(u => {
    const tr = document.createElement('tr');
    const uName = (u.username || '').toLowerCase();
    const isMaster = uName === 'gabriel';
    const role = isMaster ? 'worn' : (u.role || (u.isAdmin ? 'admin' : 'vendedor'));

    let statusLabel = '<span style="color:#10b981; font-weight:700;">🟢 Ativo</span>';
    if (u.status === 'pending_approval') {
      statusLabel = '<span style="background: rgba(245, 158, 11, 0.18); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 2px 7px; border-radius: 6px; font-size: 0.72rem; font-weight: 800;">⏳ Pendente Aprovação</span>';
    } else if (u.status === 'inactive') {
      statusLabel = '<span style="color:#ef4444; font-weight:700;">❌ Inativo</span>';
    }

    let roleBadge = '<span style="background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78rem;">👤 Vendedor</span>';
    if (role === 'worn' || role === 'owner' || isMaster) {
      roleBadge = '<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78rem;">👑 Worn</span>';
    } else if (role === 'admin') {
      roleBadge = '<span style="background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.4); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78rem;">🛡️ Admin</span>';
    }

    const limitLabel = (role === 'worn' || role === 'owner' || role === 'admin') 
      ? '<span style="color:#64748b;">Ilimitado</span>' 
      : `<strong>${u.freeUsageToday || 0} / ${u.freeDailyLimit || 5}</strong> hoje`;

    const authDirectLabel = u.allPlansDirect 
      ? '<span style="color:#38bdf8; font-size: 0.75rem; font-weight: 700; margin-left: 4px;">🔓 Direto</span>' 
      : '<span style="color:#f59e0b; font-size: 0.75rem; font-weight: 700; margin-left: 4px;">⏳ Com Aprovação</span>';

    // Ações permitidas: apenas Owner ou o próprio criador
    const canEdit = isOwner || (!isMaster && role === 'vendedor');

    tr.innerHTML = `
      <td style="font-weight: 700; color: #f8fafc;">
        ${escapeHtml(u.username)}
        ${isMaster ? '<span style="font-size:0.7rem; color:#f59e0b; margin-left:4px;">(Principal)</span>' : ''}
      </td>
      <td>${roleBadge} ${authDirectLabel}</td>
      <td>${statusLabel}</td>
      <td style="font-size: 0.85rem; color: #e2e8f0;">${limitLabel}</td>
      <td><span style="font-weight: 700; color: #38bdf8;">${u.totalKeys || 0}</span> keys</td>
      <td style="font-size: 0.8rem; color: #64748b;">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
      <td>
        ${canEdit ? `<button onclick="openEditUserModal('${escapeHtml(u.username)}')" class="btn-action" title="Editar Usuário" style="color:#818cf8; margin-right:4px;">✏️</button>` : ''}
        ${isOwner && !isMaster ? `
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
    const freeDailyLimit = parseInt(newFreeLimitInput.value, 10) || 5;
    const allPlansDirect = newAllDirect ? newAllDirect.checked : false;

    createUserError.style.display = 'none';
    createUserSuccess.style.display = 'none';

    if (!newUsername || !newPassword) {
      createUserError.textContent = '❌ Preencha o usuário e a senha.';
      createUserError.style.display = 'block';
      return;
    }

    // Coleta planos permitidos selecionados
    const allowedPlans = [];
    if (newVendorPlansList) {
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
          newRole: currentNewUserRole,
          newIsAdmin: currentNewUserRole === 'owner' || currentNewUserRole === 'admin',
          allPlansDirect,
          allowedPlans,
          freeDailyLimit
        })
      });
      const data = await res.json();

      if (data.success) {
        if (data.pendingApproval) {
          createUserSuccess.innerHTML = `⏳ <strong>Solicitação de Cadastro Enviada!</strong><br>${escapeHtml(data.message)}`;
          createUserSuccess.style.color = '#f59e0b';
        } else {
          createUserSuccess.textContent = `✔️ Usuário "${newUsername}" cadastrado com sucesso!`;
          createUserSuccess.style.color = '#10b981';
        }
        createUserSuccess.style.display = 'block';
        newUsernameInput.value = '';
        newPasswordInput.value = '';
        loadUsers();
        if (navApprovals && navApprovals.style.display !== 'none') loadApprovals();
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
let editingRole = 'vendedor';

window.openEditUserModal = function(username) {
  const user = currentLoadedUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return;

  editingUsername = user.username;
  editingRole = user.role || (user.isAdmin ? 'admin' : 'vendedor');

  document.getElementById('edit-modal-username-label').textContent = `Editando: ${user.username}`;
  document.getElementById('edit-modal-new-password').value = '';
  document.getElementById('edit-modal-msg').textContent = '';

  if (editModalAllDirect) {
    editModalAllDirect.checked = !!user.allPlansDirect;
  }

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

  setModalRole(editingRole);
  document.getElementById('edit-user-modal').style.display = 'flex';
};

window.setModalRole = function(role) {
  editingRole = (role === 'owner') ? 'worn' : role;
  const btnVendedor = document.getElementById('btn-role-vendedor');
  const btnAdmin = document.getElementById('btn-role-admin');
  const btnOwner = document.getElementById('btn-role-owner');
  const editVendorOptions = document.getElementById('edit-vendor-options');

  if (btnVendedor) {
    btnVendedor.style.border = editingRole === 'vendedor' ? '2px solid #38bdf8' : '2px solid transparent';
    btnVendedor.style.background = editingRole === 'vendedor' ? 'rgba(56,189,248,0.25)' : 'rgba(56,189,248,0.06)';
  }
  if (btnAdmin) {
    btnAdmin.style.border = editingRole === 'admin' ? '2px solid #818cf8' : '2px solid transparent';
    btnAdmin.style.background = editingRole === 'admin' ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.06)';
  }
  if (btnOwner) {
    btnOwner.style.border = (editingRole === 'worn' || editingRole === 'owner') ? '2px solid #f59e0b' : '2px solid transparent';
    btnOwner.style.background = (editingRole === 'worn' || editingRole === 'owner') ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.06)';
  }

  if (editVendorOptions) {
    editVendorOptions.style.display = (editingRole === 'worn' || editingRole === 'owner') ? 'none' : 'block';
  }
};

window.closeEditModal = function() {
  document.getElementById('edit-user-modal').style.display = 'none';
};

window.saveUserEdit = async function() {
  const newPassword = document.getElementById('edit-modal-new-password').value.trim();
  const freeDailyLimit = parseInt(document.getElementById('edit-modal-free-limit').value, 10) || 5;
  const allPlansDirect = editModalAllDirect ? editModalAllDirect.checked : false;
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
        newRole: editingRole,
        newIsAdmin: editingRole === 'owner' || editingRole === 'admin',
        allPlansDirect,
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

// ═══════════════════════════════════════════════════════════════════════
//  CENTRAL DE APROVAÇÕES (OWNER)
// ═══════════════════════════════════════════════════════════════════════

async function loadApprovals() {
  if (!userToken) return;

  try {
    const res = await fetch(`${API_URL}/api/approvals`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const data = await res.json();

    if (data.success && Array.isArray(data.approvals)) {
      currentLoadedApprovals = data.approvals;
      renderApprovalsDashboard(data);
    }
  } catch (e) {
    console.error('Erro ao carregar aprovações:', e);
  }
}

function renderApprovalsDashboard(data) {
  const approvals = data.approvals || [];
  const pendingKeys = approvals.filter(a => a.type === 'key' && a.status === 'pending');
  const pendingUsers = approvals.filter(a => a.type === 'user' && a.status === 'pending');
  const totalPending = pendingKeys.length + pendingUsers.length;
  const approvedTotal = approvals.filter(a => a.status === 'approved').length;

  if (statApprovalsTotal) statApprovalsTotal.textContent = totalPending;
  if (statApprovalsKeys) statApprovalsKeys.textContent = pendingKeys.length;
  if (statApprovalsUsers) statApprovalsUsers.textContent = pendingUsers.length;
  if (statApprovalsDone) statApprovalsDone.textContent = approvedTotal;

  if (badgePendingCount) {
    if (totalPending > 0) {
      badgePendingCount.textContent = totalPending;
      badgePendingCount.style.display = 'inline-block';
    } else {
      badgePendingCount.style.display = 'none';
    }
  }

  renderApprovalsKeysTable(approvals.filter(a => a.type === 'key'));
  renderApprovalsUsersTable(approvals.filter(a => a.type === 'user'));
}

function renderApprovalsKeysTable(keys) {
  if (!approvalsKeysBody) return;
  approvalsKeysBody.innerHTML = '';

  if (keys.length === 0) {
    approvalsKeysBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 25px;">Nenhuma solicitação de chave pendente ou registrada.</td></tr>';
    return;
  }

  keys.forEach(item => {
    const tr = document.createElement('tr');
    const isPending = item.status === 'pending';

    let statusBadge = '<span style="background: rgba(245, 158, 11, 0.18); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem;">⏳ Aguardando Owner</span>';
    if (item.status === 'approved') {
      statusBadge = `<span style="background: rgba(16, 185, 129, 0.18); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem;">✅ Aprovada</span><br><code style="font-size:0.75rem; color:#38bdf8;">${escapeHtml(item.generatedKey || '')}</code>`;
    } else if (item.status === 'rejected') {
      statusBadge = '<span style="background: rgba(239, 68, 68, 0.18); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem;">❌ Recusada</span>';
    }

    const requesterRoleBadge = item.requesterRole === 'admin'
      ? '<span style="background: rgba(99,102,241,0.15); color: #818cf8; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">🛡️ Admin</span>'
      : '<span style="background: rgba(56,189,248,0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">👤 Vendedor</span>';

    tr.innerHTML = `
      <td style="font-weight: 700; color: #f8fafc;">
        ${escapeHtml(item.requestedBy || 'Admin')}<br>
        ${requesterRoleBadge}
      </td>
      <td>
        <strong style="color:#e2e8f0;">${escapeHtml(item.clientName || 'Cliente VIP')}</strong><br>
        <span style="font-size: 0.75rem; color: #64748b;">${escapeHtml(item.uuid || 'Qualquer PC')}</span>
      </td>
      <td>
        <span style="color:#a5b4fc; font-weight: 700;">${escapeHtml(item.planName || 'Licença')}</span><br>
        <span style="font-size: 0.75rem; color: #94a3b8;">${item.durationHours ? `${item.durationHours}h` : 'Permanente'}</span>
      </td>
      <td style="font-size: 0.8rem; color: #64748b;">${item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : '—'}</td>
      <td>${statusBadge}</td>
      <td style="text-align: center;">
        ${isPending ? `
          <button onclick="approveKeyApproval('${escapeHtml(item.id)}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 6px; background: #10b981; border: none;">✅ Aprovar</button>
          <button onclick="rejectKeyApproval('${escapeHtml(item.id)}')" class="btn btn-logout" style="padding: 6px 12px; font-size: 0.8rem; border: none;">❌ Recusar</button>
        ` : `<span style="font-size: 0.8rem; color: #64748b;">Finalizada</span>`}
      </td>
    `;
    approvalsKeysBody.appendChild(tr);
  });
}

function renderApprovalsUsersTable(users) {
  if (!approvalsUsersBody) return;
  approvalsUsersBody.innerHTML = '';

  if (users.length === 0) {
    approvalsUsersBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 25px;">Nenhuma solicitação de novo usuário pendente ou registrada.</td></tr>';
    return;
  }

  users.forEach(item => {
    const tr = document.createElement('tr');
    const isPending = item.status === 'pending';

    let statusBadge = '<span style="background: rgba(245, 158, 11, 0.18); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem;">⏳ Aguardando Owner</span>';
    if (item.status === 'approved') {
      statusBadge = '<span style="background: rgba(16, 185, 129, 0.18); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem;">✅ Aprovado</span>';
    } else if (item.status === 'rejected') {
      statusBadge = '<span style="background: rgba(239, 68, 68, 0.18); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem;">❌ Recusado</span>';
    }

    tr.innerHTML = `
      <td style="font-weight: 700; color: #f8fafc;">
        ${escapeHtml(item.username)}
      </td>
      <td>
        <span style="background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78rem;">👤 Vendedor</span>
      </td>
      <td style="font-size: 0.85rem; color: #e2e8f0;">
        ${escapeHtml(item.requestedBy || 'Admin')}
      </td>
      <td style="font-size: 0.8rem; color: #64748b;">${item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : '—'}</td>
      <td>${statusBadge}</td>
      <td style="text-align: center;">
        ${isPending ? `
          <button onclick="approveUserApproval('${escapeHtml(item.id)}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 6px; background: #10b981; border: none;">✅ Aprovar Cadastro</button>
          <button onclick="rejectUserApproval('${escapeHtml(item.id)}')" class="btn btn-logout" style="padding: 6px 12px; font-size: 0.8rem; border: none;">❌ Recusar</button>
        ` : `<span style="font-size: 0.8rem; color: #64748b;">Finalizada</span>`}
      </td>
    `;
    approvalsUsersBody.appendChild(tr);
  });
}

// Ações de Aprovação de Chaves
window.approveKeyApproval = async function(id) {
  if (!confirm('Deseja realmente aprovar esta chave? A licença será gerada e liberada imediatamente!')) return;

  try {
    const res = await fetch(`${API_URL}/api/approvals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ action: 'approve-key', id })
    });
    const data = await res.json();

    if (data.success) {
      alert(`🎉 CHAVE APROVADA COM SUCESSO!\n\nCódigo da Chave Gerada: ${data.key}`);
      loadApprovals();
      loadLicenses();
    } else {
      alert(`❌ Erro: ${data.error || 'Não foi possível aprovar a chave.'}`);
    }
  } catch (e) {
    alert('❌ Erro ao processar aprovação.');
  }
};

window.rejectKeyApproval = async function(id) {
  const reason = prompt('Deseja informar o motivo da recusa? (Opcional):', 'Solicitação recusada pelo Owner');
  if (reason === null) return;

  try {
    const res = await fetch(`${API_URL}/api/approvals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ action: 'reject-key', id, reason })
    });
    const data = await res.json();

    if (data.success) {
      loadApprovals();
    } else {
      alert(`❌ Erro: ${data.error || 'Não foi possível recusar a solicitação.'}`);
    }
  } catch (e) {
    alert('❌ Erro ao recusar solicitação.');
  }
};

// Ações de Aprovação de Usuários
window.approveUserApproval = async function(id) {
  if (!confirm('Deseja aprovar o cadastro deste novo usuário? Ele poderá fazer login no painel imediatamente!')) return;

  try {
    const res = await fetch(`${API_URL}/api/approvals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ action: 'approve-user', id })
    });
    const data = await res.json();

    if (data.success) {
      alert('✔️ Cadastro de Usuário Aprovado com Sucesso!');
      loadApprovals();
      loadUsers();
    } else {
      alert(`❌ Erro: ${data.error || 'Não foi possível aprovar o usuário.'}`);
    }
  } catch (e) {
    alert('❌ Erro ao processar aprovação de usuário.');
  }
};

window.rejectUserApproval = async function(id) {
  if (!confirm('Deseja realmente recusar o cadastro deste usuário?')) return;

  try {
    const res = await fetch(`${API_URL}/api/approvals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ action: 'reject-user', id })
    });
    const data = await res.json();

    if (data.success) {
      loadApprovals();
      loadUsers();
    } else {
      alert(`❌ Erro: ${data.error || 'Não foi possível recusar o cadastro.'}`);
    }
  } catch (e) {
    alert('❌ Erro ao recusar cadastro.');
  }
};

// Listeners auxiliares
if (btnRefreshLicenses) btnRefreshLicenses.addEventListener('click', loadLicenses);
if (btnRefreshUsers) btnRefreshUsers.addEventListener('click', loadUsers);
if (btnRefreshApprovals) btnRefreshApprovals.addEventListener('click', loadApprovals);
if (searchLicensesInput) searchLicensesInput.addEventListener('input', () => renderLicensesTable(currentLoadedLicenses));
if (filterSellerSelect) filterSellerSelect.addEventListener('change', () => renderLicensesTable(currentLoadedLicenses));
