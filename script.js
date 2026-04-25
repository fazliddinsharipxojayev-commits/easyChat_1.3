// Vault logic
const vaultModal = document.getElementById('vaultModal');
const accountsList = document.getElementById('accountsList');

function openVault() {
    vaultModal.classList.add('active');
    renderAccounts();
}

function closeVault() {
    vaultModal.classList.remove('active');
}

// Close modal when clicking outside
vaultModal.addEventListener('click', (e) => {
    if (e.target === vaultModal) {
        closeVault();
    }
});

function getAccounts() {
    const accs = localStorage.getItem('socialVaultAccounts');
    return accs ? JSON.parse(accs) : [];
}

function saveAccounts(accounts) {
    localStorage.setItem('socialVaultAccounts', JSON.stringify(accounts));
}

function addAccount() {
    const platform = document.getElementById('accPlatform').value.trim();
    const username = document.getElementById('accUsername').value.trim();
    const password = document.getElementById('accPassword').value.trim();

    if (!platform || !username || !password) {
        alert("Please fill in all fields");
        return;
    }

    const accounts = getAccounts();
    accounts.push({
        id: Date.now().toString(),
        platform,
        username,
        password
    });

    saveAccounts(accounts);
    
    // Clear inputs
    document.getElementById('accPlatform').value = '';
    document.getElementById('accUsername').value = '';
    document.getElementById('accPassword').value = '';
    
    renderAccounts();
}

function deleteAccount(id) {
    let accounts = getAccounts();
    accounts = accounts.filter(acc => acc.id !== id);
    saveAccounts(accounts);
    renderAccounts();
}

function renderAccounts() {
    const accounts = getAccounts();
    accountsList.innerHTML = '';

    if (accounts.length === 0) {
        accountsList.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.4); padding: 20px;">No accounts saved yet.</p>';
        return;
    }

    accounts.forEach(acc => {
        const item = document.createElement('div');
        item.className = 'account-item';
        
        item.innerHTML = `
            <div class="acc-info">
                <span class="acc-platform">${acc.platform}</span>
                <span class="acc-details">User: ${acc.username}</span>
                <span class="acc-details">Pass: ${'*'.repeat(acc.password.length)}</span>
            </div>
            <button class="delete-btn" onclick="deleteAccount('${acc.id}')">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        accountsList.appendChild(item);
    });
}
