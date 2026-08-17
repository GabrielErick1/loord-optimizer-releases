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
const btnLogout = document.getElementById('btn-logout');

const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Aba do Gerador de Keys
const clientNameInput = document.getElementById('client-name');
const clientUuidInput = document.getElementById('client-uuid');
const licenseTypeSelect = document.getElementById('license-type');
const customDaysContainer = document.getElementById('custom-days-container');
const customDaysInput = document.getElementById('custom-days');
const btnGenerate = document.getElementById('btn-generate');
const resultBox = document.getElementById('result-box');
const keyOutput = document.getElementById('key-output');
const resultDetails = document.getElementById('result-details');
const btnCopy = document.getElementById('btn-copy');

// Aba de Licenças
const licensesListBody = document.getElementById('licenses-list-body');
const btnRefreshLicenses = document.getElementById('btn-refresh-licenses');
const searchLicensesInput = document.getElementById('search-licenses');
const filterSellerSelect = document.getElementById('filter-seller');

// Aba de Gerenciamento de Usuários
const newUsernameInput = document.getElementById('new-username');
const newPasswordInput = document.getElementById('new-password');
const newIsAdminCheckbox = document.getElementById('new-is-admin');
const btnCreateUser = document.getElementById('btn-create-user');
const btnRefreshUsers = document.getElementById('btn-refresh-users');
const createUserError = document.getElementById('create-user-error');
const createUserSuccess = document.getElementById('create-user-success');
const usersListBody = document.getElementById('users-list-body');

let userToken = localStorage.getItem('admin_token');
let currentLoadedLicenses = [];
let currentLoadedUsers = [];

// Helper para escapar HTML e evitar injeções
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Toggle Custom Days container
if (licenseTypeSelect) {
  licenseTypeSelect.addEventListener('change', () => {
    if (licenseTypeSelect.value === 'temporary-custom') {
      customDaysContainer.style.display = 'block';
    } else {
      customDaysContainer.style.display = 'none';
    }
  });
}

if (btnRefreshLicenses) {
  btnRefreshLicenses.addEventListener('click', () => {
    loadLicenses();
  });
}

if (btnRefreshUsers) {
  btnRefreshUsers.addEventListener('click', () => {
    loadUsers();
  });
}

if (searchLicensesInput) {
  searchLicensesInput.addEventListener('input', () => {
    renderLicensesTable(currentLoadedLicenses);
  });
}

if (filterSellerSelect) {
  filterSellerSelect.addEventListener('change', () => {
    renderLicensesTable(currentLoadedLicenses);
  });
}

// Local cache storage helpers
function getLocalLicensesCache() {
  try {
    return JSON.parse(localStorage.getItem('admin_licenses_cache') || '[]');
  } catch (e) {
    return [];
  }
}

function saveLocalLicensesCache(licenses) {
  try {
    localStorage.setItem('admin_licenses_cache', JSON.stringify(licenses));
  } catch (e) {}
}

function getLocalUsersCache() {
  try {
    return JSON.parse(localStorage.getItem('admin_users_cache') || '[]');
  } catch (e) {
    return [];
  }
}

function saveLocalUsersCache(users) {
  try {
    localStorage.setItem('admin_users_cache', JSON.stringify(users));
  } catch (e) {}
}

// Atualizar Dropdown de Vendedores
function updateSellerDropdown(licenses, users) {
  if (!filterSellerSelect) return;
  const currentVal = filterSellerSelect.value;
  const sellers = new Set();
  
  if (Array.isArray(users)) {
    users.forEach(u => sellers.add(u.username));
  }
  if (Array.isArray(licenses)) {
    licenses.forEach(l => {
      if (l.createdBy) sellers.add(l.createdBy);
    });
  }

  filterSellerSelect.innerHTML = '<option value="">👤 Todos os Vendedores</option>';
  Array.from(sellers).sort().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.toLowerCase();
    opt.textContent = `👤 ${s}`;
    if (currentVal && currentVal.toLowerCase() === s.toLowerCase()) {
      opt.selected = true;
    }
    filterSellerSelect.appendChild(opt);
  });
}

// Monitor de Abas
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    item.classList.add('active');
    const tabId = `tab-${item.getAttribute('data-tab')}`;
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');

    if (item.getAttribute('data-tab') === 'users') {
      loadUsers();
    } else if (item.getAttribute('data-tab') === 'licenses') {
      loadLicenses();
    }
  });
});

// Ações do Login
btnLogin.addEventListener('click', async () => {
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;

  if (!username || !password) return;

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
      const isMaster = (data.username && data.username.toLowerCase() === 'gabriel') || data.isAdmin === true;
      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_username', data.username);
      localStorage.setItem('admin_is_admin', isMaster ? 'true' : 'false');
      userToken = data.token;
      initDashboard(data.username, isMaster);
    } else {
      loginError.textContent = `❌ ${data.error || 'Erro ao fazer login.'}`;
      loginError.style.display = 'block';
    }
  } catch (e) {
    console.error(e);
    loginError.textContent = '❌ Erro de conexão com o servidor.';
    loginError.style.display = 'block';
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Entrar no Painel';
  }
});

// Iniciar visualização do Dashboard
function initDashboard(username, isAdmin) {
  const isMaster = (username && username.toLowerCase() === 'gabriel') || isAdmin === true;

  loginContainer.style.display = 'none';
  dashboardContainer.style.display = 'flex';
  displayUsername.textContent = username;
  displayRole.textContent = isMaster ? 'Administrador Master' : 'Vendedor / Colaborador';
  
  if (navUsers) {
    navUsers.style.display = isMaster ? 'flex' : 'none';
  }

  // Resetar abas para o gerador por padrão
  navItems.forEach(nav => nav.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));
  document.querySelector('[data-tab="generator"]').classList.add('active');
  document.getElementById('tab-generator').classList.add('active');
  
  clientNameInput.value = '';
  clientUuidInput.value = '';
  resultBox.style.display = 'none';
  
  loadLicenses();
  if (isMaster) {
    loadUsers();
  }
}

// Auto-login se já tiver token
(async function checkExistingSession() {
  if (userToken) {
    const savedUser = localStorage.getItem('admin_username') || 'gabriel';
    const isMaster = (savedUser.toLowerCase() === 'gabriel') || localStorage.getItem('admin_is_admin') === 'true';
    initDashboard(savedUser, isMaster);
  }
})();

// Ação de Gerar Key
btnGenerate.addEventListener('click', async () => {
  const uuid = clientUuidInput.value.trim();
  const clientName = clientNameInput.value.trim() || 'Cliente VIP';
  const typeVal = licenseTypeSelect.value;
  
  let licenseType = 'permanent-unlimited';
  let durationDays = null;

  if (typeVal === 'permanent-single') {
    licenseType = 'permanent-single';
  } else if (typeVal === 'permanent-unlimited' || typeVal === 'permanent') {
    licenseType = 'permanent-unlimited';
  } else if (typeVal === 'temporary-1') {
    licenseType = 'temporary';
    durationDays = 1;
  } else if (typeVal === 'temporary-7') {
    licenseType = 'temporary';
    durationDays = 7;
  } else if (typeVal === 'temporary-15') {
    licenseType = 'temporary';
    durationDays = 15;
  } else if (typeVal === 'temporary-30') {
    licenseType = 'temporary';
    durationDays = 30;
  } else if (typeVal === 'temporary-custom') {
    licenseType = 'temporary';
    durationDays = parseInt(customDaysInput.value, 10) || 30;
  }

  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Gerando...';
  resultBox.style.display = 'none';

  const currentLoggedInUser = localStorage.getItem('admin_username') || 'gabriel';

  try {
    const res = await fetch(`${API_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ uuid, clientName, licenseType, durationDays })
    });
    const data = await res.json();

    if (data.success) {
      keyOutput.textContent = data.key;
      let typeLabel = '👑 Vitalícia - Reativação Ilimitada no Mesmo PC (UUID)';
      if (licenseType === 'permanent-single') {
        typeLabel = '👑 Vitalícia - 1 Ativação Única (Chave Descartável pós-uso)';
      } else if (licenseType === 'temporary') {
        typeLabel = `⏳ Temporária (${durationDays} Dias de Validade após ativação)`;
      }

      resultDetails.innerHTML = `
        <strong>Cliente:</strong> ${escapeHtml(data.clientName)}<br>
        <strong>Tipo:</strong> ${typeLabel}<br>
        <strong>Vendedor:</strong> 👤 ${escapeHtml(currentLoggedInUser)}<br>
        <strong>Vínculo UUID:</strong> ${data.uuid && data.uuid !== 'Aguardando Ativação' ? escapeHtml(data.uuid) : 'Chave Avulsa (Vinculará ao primeiro PC que ativar)'}
      `;
      resultBox.style.display = 'block';

      // Save locally to cache immediately
      const cached = getLocalLicensesCache();
      const newEntry = {
        uuid: data.uuid !== 'Aguardando Ativação' ? data.uuid : null,
        key: data.key,
        clientName: data.clientName,
        licenseType: data.licenseType,
        activationMode: data.activationMode,
        durationDays: data.durationDays,
        createdBy: currentLoggedInUser,
        status: 'pending',
        createdAt: Date.now(),
        activatedAt: null,
        expiresAt: null
      };
      const idx = cached.findIndex(c => c.key === data.key);
      if (idx !== -1) cached[idx] = newEntry; else cached.unshift(newEntry);
      saveLocalLicensesCache(cached);

      loadLicenses();
    } else {
      alert(`Erro: ${data.error || 'Não foi possível gerar a chave.'}`);
    }
  } catch (e) {
    console.error(e);
    alert('Erro de conexão ao gerar a chave.');
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.textContent = '⚡ Gerar Chave de Ativação';
  }
});

// Ação de Copiar Key
btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(keyOutput.textContent);
  btnCopy.textContent = 'Copiado!';
  setTimeout(() => {
    btnCopy.textContent = 'Copiar';
  }, 2000);
});

// Carregar Lista de Licenças
async function loadLicenses() {
  licensesListBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-gray);">Carregando licenças...</td></tr>';
  
  let licenses = getLocalLicensesCache();

  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ clientLicenses: licenses })
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.licenses)) {
      licenses = data.licenses;
      saveLocalLicensesCache(licenses);
    }
  } catch (e) {
    console.warn('Usando cache local de licenças:', e);
  }

  currentLoadedLicenses = licenses;
  updateSellerDropdown(licenses, currentLoadedUsers);
  renderLicensesTable(licenses);
}

// Renderizar Tabela de Licenças com Filtro de Vendedor e Busca
function renderLicensesTable(licenses) {
  licensesListBody.innerHTML = '';
  
  const totalCount = licenses.length;
  const activeCount = licenses.filter(l => l.status === 'activated').length;
  const pendingCount = licenses.filter(l => l.status === 'pending').length;
  const revokedCount = licenses.filter(l => l.status === 'revoked' || (l.licenseType === 'temporary' && l.expiresAt && Date.now() > l.expiresAt)).length;

  const statTotal = document.getElementById('stat-total');
  const statActive = document.getElementById('stat-active');
  const statPending = document.getElementById('stat-pending');
  const statRevoked = document.getElementById('stat-revoked');

  if (statTotal) statTotal.textContent = totalCount;
  if (statActive) statActive.textContent = activeCount;
  if (statPending) statPending.textContent = pendingCount;
  if (statRevoked) statRevoked.textContent = revokedCount;

  const query = (searchLicensesInput ? searchLicensesInput.value.trim().toLowerCase() : '');
  const selectedSeller = (filterSellerSelect ? filterSellerSelect.value.trim().toLowerCase() : '');

  const filtered = licenses.filter(l => {
    if (selectedSeller && (!l.createdBy || l.createdBy.toLowerCase() !== selectedSeller)) {
      return false;
    }
    if (!query) return true;
    return (
      (l.clientName && l.clientName.toLowerCase().includes(query)) ||
      (l.key && l.key.toLowerCase().includes(query)) ||
      (l.uuid && l.uuid.toLowerCase().includes(query)) ||
      (l.createdBy && l.createdBy.toLowerCase().includes(query))
    );
  });

  if (filtered.length === 0) {
    licensesListBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-gray);">Nenhuma chave encontrada com estes filtros.</td></tr>';
    return;
  }

  filtered.forEach(l => {
    const tr = document.createElement('tr');
    let statusText = '🟡 Pendente';
    let statusClass = 'user';
    
    // Check if expired
    const isExpired = l.licenseType === 'temporary' && l.expiresAt && Date.now() > l.expiresAt;
    
    if (l.status === 'revoked') {
      statusText = '🔴 Revogado';
      statusClass = 'user';
    } else if (isExpired) {
      statusText = '⌛ Expirado';
      statusClass = 'user';
    } else if (l.status === 'activated') {
      statusText = '🟢 Ativo';
      statusClass = 'admin';
    }

    let typeBadge = '';
    if (l.licenseType === 'temporary') {
      typeBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">⏳ ${l.durationDays || 30} Dias</span>`;
    } else if (l.licenseType === 'permanent-single') {
      typeBadge = `<span style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">👑 Vitalícia (1 Uso)</span>`;
    } else {
      typeBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">👑 Vitalícia (Reativação)</span>`;
    }

    const sellerBadge = `<span style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.25); padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">👤 ${escapeHtml(l.createdBy || 'gabriel')}</span>`;

    const creationDate = l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : '-';
    
    let validityText = 'Vitalícia (Nunca Expira)';
    if (l.licenseType === 'temporary') {
      if (l.expiresAt) {
        const remainingMs = l.expiresAt - Date.now();
        const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
        const expDate = new Date(l.expiresAt).toLocaleDateString('pt-BR');
        validityText = daysRemaining > 0 
          ? `<span style="color: #10b981;">Até ${expDate} (${daysRemaining}d)</span>`
          : `<span style="color: #ef4444; font-weight: bold;">Expirou em ${expDate}</span>`;
      } else {
        validityText = `<span style="color: #f59e0b;">${l.durationDays || 30}d após primeiro uso</span>`;
      }
    } else if (l.licenseType === 'permanent-single') {
      validityText = '<span style="color: #c084fc;">Vitalícia (1 Ativação Única)</span>';
    } else {
      validityText = '<span style="color: #10b981;">Vitalícia (Reativação Ilimitada)</span>';
    }

    const uuidDisplay = l.uuid 
      ? `<span style="font-family: monospace; font-size: 0.75rem;" title="${escapeHtml(l.uuid)}">${escapeHtml(l.uuid.substring(0, 16))}...</span>`
      : `<span style="color: #f59e0b; font-size: 0.8rem; font-style: italic;">Aguardando PC</span>`;
    
    tr.innerHTML = `
      <td><strong>${escapeHtml(l.clientName || 'Cliente VIP')}</strong></td>
      <td>${typeBadge}</td>
      <td>${sellerBadge}</td>
      <td>${uuidDisplay}</td>
      <td><span style="font-family: monospace; font-size: 0.85rem; color: #ef4444; font-weight: 700;">${escapeHtml(l.key)}</span></td>
      <td><span class="role-badge ${statusClass}">${statusText}</span></td>
      <td style="font-size: 0.8rem;">${creationDate}</td>
      <td style="font-size: 0.8rem;">${validityText}</td>
      <td>
        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
          <button class="btn-copy" style="background-color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); color: white; padding: 4px 6px; font-size: 0.7rem;" title="Invalidar a chave e bloquear o software do cliente" onclick="revokeLicense('${escapeHtml(l.uuid || '')}', '${escapeHtml(l.key)}')">🔴 Revogar</button>
          <button class="btn-copy" style="background-color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); color: white; padding: 4px 6px; font-size: 0.7rem;" title="Desvincular o computador e deslogar do software" onclick="unlinkPc('${escapeHtml(l.uuid || '')}', '${escapeHtml(l.key)}')">🔄 Deslogar</button>
          <button class="btn-copy" style="background-color: #334155; border: 1px solid rgba(255, 255, 255, 0.1); color: white; padding: 4px 6px; font-size: 0.7rem;" title="Excluir do painel" onclick="deleteLicense('${escapeHtml(l.uuid || '')}', '${escapeHtml(l.key)}')">🗑️</button>
        </div>
      </td>
    `;
    licensesListBody.appendChild(tr);
  });
}

// Ações de Licença:
// 1. Revogar / Invalidar Chave
window.revokeLicense = async function(uuid, key) {
  if (!confirm(`Deseja realmente REVOGAR e INVALIDAR a chave ${key}? O software do cliente será bloqueado imediatamente.`)) return;
  
  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ uuid, key, action: 'revoke' })
    });
    const data = await res.json();
    
    // Update local cache
    const cached = getLocalLicensesCache();
    const target = cached.find(c => (key && c.key === key) || (uuid && c.uuid === uuid));
    if (target) {
      target.status = 'revoked';
      saveLocalLicensesCache(cached);
    }

    loadLicenses();
  } catch (e) {
    console.error(e);
    alert('Erro ao revogar licença.');
  }
};

// 2. Desvincular PC / Deslogar do Software
window.unlinkPc = async function(uuid, key) {
  if (!confirm(`Deseja DESLOGAR o PC vinculado à chave ${key}? A máquina atual será desvinculada e a chave poderá ser ativada em outro PC.`)) return;

  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ uuid, key, action: 'unlink' })
    });
    const data = await res.json();
    
    // Update local cache
    const cached = getLocalLicensesCache();
    const target = cached.find(c => (key && c.key === key) || (uuid && c.uuid === uuid));
    if (target) {
      target.uuid = null;
      target.status = 'pending';
      target.activatedAt = null;
      saveLocalLicensesCache(cached);
    }

    alert('Computador desvinculado! O usuário foi deslogado com sucesso.');
    loadLicenses();
  } catch (e) {
    console.error(e);
    alert('Erro ao deslogar computador.');
  }
};

// 3. Excluir Chave
window.deleteLicense = async function(uuid, key) {
  if (!confirm(`Deseja EXCLUIR permanentemente a chave ${key}?`)) return;

  try {
    const res = await fetch(`${API_URL}/api/licenses`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ uuid, key, action: 'delete' })
    });
    const data = await res.json();
    
    // Update local cache
    let cached = getLocalLicensesCache();
    cached = cached.filter(c => c.key !== key);
    saveLocalLicensesCache(cached);

    loadLicenses();
  } catch (e) {
    console.error(e);
    alert('Erro ao excluir licença.');
  }
};

// Carregar Lista de Usuários e Vendedores
async function loadUsers() {
  usersListBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-gray);">Carregando usuários...</td></tr>';
  
  let localUsers = getLocalUsersCache();

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.users)) {
      usersListBody.innerHTML = '';
      localUsers = data.users;
      saveLocalUsersCache(localUsers);
      currentLoadedUsers = localUsers;
      updateSellerDropdown(currentLoadedLicenses, localUsers);

      data.users.forEach(u => {
        const tr = document.createElement('tr');
        const roleText = u.isAdmin ? '👑 Administrador' : '👤 Vendedor';
        const roleClass = u.isAdmin ? 'admin' : 'user';
        const createdBy = u.createdBy || 'Master Admin';
        const createdAt = u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '-';
        
        const isMaster = u.username.toLowerCase() === 'gabriel';
        const isInactive = u.status === 'inactive';
        
        const statusBadge = isInactive
          ? '<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">🔴 Inativo</span>'
          : '<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">🟢 Ativo</span>';

        const changePasswordBtn = `<button class="btn-copy" style="background-color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.4); color: white; padding: 3px 7px; font-size: 0.75rem;" title="Mudar senha deste usuário" onclick="changePassword('${escapeHtml(u.username)}')">🔑 Senha</button>`;

        const toggleStatusBtn = isMaster 
          ? ''
          : `<button class="btn-copy" style="background-color: ${isInactive ? '#10b981' : '#f59e0b'}; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 3px 7px; font-size: 0.75rem;" title="${isInactive ? 'Ativar acesso do vendedor' : 'Inativar e bloquear vendedor'}" onclick="toggleUserStatus('${escapeHtml(u.username)}')">${isInactive ? '▶️ Ativar' : '⏸️ Inativar'}</button>`;

        const deleteButton = isMaster 
          ? '<span style="color: #64748b; font-size: 0.75rem; padding: 3px 6px;">Principal</span>'
          : `<button class="btn-copy" style="background-color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); color: white; padding: 3px 7px; font-size: 0.75rem;" title="Excluir usuário permanentemente" onclick="deleteUser('${escapeHtml(u.username)}')">🗑️</button>`;

        tr.innerHTML = `
          <td><strong>${escapeHtml(u.username)}</strong></td>
          <td><span class="role-badge ${roleClass}">${roleText}</span></td>
          <td>${statusBadge}</td>
          <td style="font-size: 0.85rem; color: #94a3b8;">${escapeHtml(createdBy)}</td>
          <td>
            <span style="font-size: 0.95rem; font-weight: 800; color: #38bdf8;">${u.totalKeys || 0}</span> 
            <span style="font-size: 0.75rem; color: #10b981; font-weight: 600;">(${u.activeKeys || 0} ativas)</span>
          </td>
          <td style="font-size: 0.85rem;">${createdAt}</td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
              ${changePasswordBtn}
              ${toggleStatusBtn}
              ${deleteButton}
            </div>
          </td>
        `;
        usersListBody.appendChild(tr);
      });
    } else {
      usersListBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--red);">Erro: ${data.error || 'Não foi possível carregar.'}</td></tr>`;
    }
  } catch (e) {
    console.error(e);
    usersListBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--red);">Erro ao conectar com o servidor.</td></tr>';
  }
}

// Ação de Criar Novo Usuário / Vendedor
btnCreateUser.addEventListener('click', async () => {
  const newUsername = newUsernameInput.value.trim();
  const newPassword = newPasswordInput.value;
  const newIsAdmin = newIsAdminCheckbox.checked;

  if (!newUsername || !newPassword) {
    createUserError.textContent = '❌ Preencha o nome de usuário e a senha.';
    createUserError.style.display = 'block';
    return;
  }

  btnCreateUser.disabled = true;
  btnCreateUser.textContent = 'Criando...';
  createUserError.style.display = 'none';
  createUserSuccess.style.display = 'none';

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ newUsername, newPassword, newIsAdmin })
    });
    const data = await res.json();

    if (data.success) {
      createUserSuccess.textContent = `✔️ Usuário "${newUsername}" cadastrado com sucesso!`;
      createUserSuccess.style.display = 'block';
      newUsernameInput.value = '';
      newPasswordInput.value = '';
      newIsAdminCheckbox.checked = false;
      loadUsers();
    } else {
      createUserError.textContent = `❌ ${data.error || 'Erro ao criar usuário.'}`;
      createUserError.style.display = 'block';
    }
  } catch (e) {
    console.error(e);
    createUserError.textContent = '❌ Erro de conexão com o servidor.';
    createUserError.style.display = 'block';
  } finally {
    btnCreateUser.disabled = false;
    btnCreateUser.textContent = '➕ Cadastrar Usuário';
  }
});

// Ação de Mudar Senha de Usuário
window.changePassword = async function(username) {
  const newPass = prompt(`Digite a NOVA SENHA para o usuário "${username}":`);
  if (!newPass) return;
  if (newPass.trim().length < 3) {
    alert('A senha deve ter no mínimo 3 caracteres.');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        action: 'change-password',
        usernameToUpdate: username,
        newPassword: newPass.trim()
      })
    });
    const data = await res.json();

    if (data.success) {
      alert(`Senha do usuário "${username}" alterada com sucesso!`);
      loadUsers();
    } else {
      alert(`Erro: ${data.error || 'Não foi possível alterar a senha.'}`);
    }
  } catch (e) {
    console.error(e);
    alert('Erro ao alterar senha.');
  }
};

// Ação de Inativar / Ativar Usuário
window.toggleUserStatus = async function(username) {
  if (!confirm(`Deseja alterar o status (Ativar/Inativar) do usuário "${username}"?`)) return;

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

    if (data.success) {
      loadUsers();
    } else {
      alert(`Erro: ${data.error || 'Não foi possível alterar o status.'}`);
    }
  } catch (e) {
    console.error(e);
    alert('Erro ao alterar status do usuário.');
  }
};

// Ação de Excluir Usuário
window.deleteUser = async function(username) {
  if (!confirm(`Deseja realmente EXCLUIR o acesso do usuário "${username}"?`)) return;

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

    if (data.success) {
      loadUsers();
    } else {
      alert(`Erro: ${data.error || 'Não foi possível excluir o usuário.'}`);
    }
  } catch (e) {
    console.error(e);
    alert('Erro ao excluir usuário.');
  }
};

// Ação de Logout
btnLogout.addEventListener('click', () => {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_username');
  localStorage.removeItem('admin_is_admin');
  userToken = null;
  loginContainer.style.display = 'flex';
  dashboardContainer.style.display = 'none';
  loginUsernameInput.value = '';
  loginPasswordInput.value = '';
  loginError.style.display = 'none';
});
