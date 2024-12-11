let web3;
let userAccount;

async function initWeb3() {
    try {
        // Check if Web3 has been injected by MetaMask
        if (typeof window.ethereum !== 'undefined') {
            try {
                // Request account access
                web3 = new Web3(window.ethereum);
                const accounts = await window.ethereum.request({
                    method: 'eth_requestAccounts'
                });
                userAccount = accounts[0];
                
                await updateWalletBalance();
                await loadProfileData();
                setupEventListeners();
                setupMetaMaskListeners();
                
            } catch (error) {
                console.error("Error connecting to MetaMask:", error);
                showError("Please connect your MetaMask wallet");
                await loadProfileData();
            }
        } else {
            console.error("MetaMask not found");
            showError("Please install MetaMask to use all features");
            await loadProfileData();
        }
    } catch (error) {
        console.error("Web3 initialization error:", error);
        await loadProfileData();
    }
}

async function loadProfileData() {
    try {
        const response = await fetch('/api/users/profile', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch profile data');
        }

        const userData = await response.json();
        
        // Update localStorage with fresh data
        localStorage.setItem('username', userData.username);
        localStorage.setItem('userType', userData.user_type);
        localStorage.setItem('ethereumAddress', userData.ethereum_address);

        // Update UI elements
        document.getElementById('current-username').textContent = userData.username;
        document.getElementById('wallet-address').textContent = userData.ethereum_address;
        document.getElementById('account-type').textContent = 
            userData.user_type.charAt(0).toUpperCase() + userData.user_type.slice(1);

    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile data');
    }
}
function showEditUsernameModal() {
    const currentUsername = document.getElementById('current-username').textContent;
    const newUsernameInput = document.getElementById('new-username');
    newUsernameInput.value = currentUsername;
    
    const modal = document.getElementById('edit-username-modal');
    modal.style.display = 'flex';
}
async function updateWalletBalance() {
    try {
        if (!web3 || !userAccount) return;
        
        const balance = await web3.eth.getBalance(userAccount);
        const ethBalance = web3.utils.fromWei(balance, 'ether');
        document.getElementById('wallet-balance').textContent = 
            `${parseFloat(ethBalance).toFixed(4)} ETH`;
            
    } catch (error) {
        console.error('Error updating wallet balance:', error);
    }
}
async function updateUsername() {
    const newUsername = document.getElementById('new-username').value;
    
    if (!newUsername || newUsername.trim().length < 3) {
        showError('Username must be at least 3 characters long');
        return;
    }

    showLoading();
    try {
        console.log('Sending update request...'); // Debug log

        const response = await fetch('/api/users/update-username', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ 
                newUsername: newUsername.trim() 
            })
        });

        console.log('Response received:', response.status); // Debug log

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update username');
        }

        const data = await response.json();
        
        // Update local storage
        localStorage.setItem('username', newUsername);
        
        // Update UI
        document.getElementById('current-username').textContent = newUsername;
        
        // Close modal
        closeModal('edit-username-modal');
        
        // Show success message
        showSuccess('Username updated successfully!');

    } catch (error) {
        console.error('Error updating username:', error);
        showError(error.message || 'Failed to update username');
    } finally {
        hideLoading();
    }
}

function copyWalletAddress() {
    const walletAddress = document.getElementById('wallet-address').textContent;
    if (walletAddress && walletAddress !== 'Not Connected') {
        navigator.clipboard.writeText(walletAddress)
            .then(() => {
                showSuccess('Wallet address copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy:', err);
                showError('Failed to copy wallet address');
            });
    }
}

function setupEventListeners() {
    // Copy wallet address button
    const copyBtn = document.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.onclick = copyWalletAddress;
    }

    // Dashboard navigation
    const dashboardLink = document.getElementById('dashboard-link');
    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            const userType = localStorage.getItem('userType');
            window.location.href = userType === 'creator' ? '/creator-dashboard' : '/investor-dashboard';
        });
    }

    // Logout handler
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', handleLogout);
    }
}

function setupLogoNavigation() {
    const logo = document.querySelector('.logo');
    if (logo) {
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            const userType = localStorage.getItem('userType');
            if (userType === 'creator') {
                window.location.href = '/creator-dashboard';
            } else if (userType === 'investor') {
                window.location.href = '/investor-dashboard';
            }
        });
    }
}

function setupMetaMaskListeners() {
    if (!window.ethereum) return;

    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            userAccount = accounts[0];
            await updateWalletBalance();
            await loadProfileData();
        } else {
            userAccount = null;
            document.getElementById('wallet-address').textContent = 'Not Connected';
            document.getElementById('wallet-balance').textContent = '0.0000 ETH';
        }
    });

    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });

    window.ethereum.on('disconnect', () => {
        userAccount = null;
        document.getElementById('wallet-address').textContent = 'Not Connected';
        document.getElementById('wallet-balance').textContent = '0.0000 ETH';
    });
}

async function handleLogout() {
    try {
        const response = await fetch('/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            localStorage.clear();
            window.location.href = '/login';
        } else {
            throw new Error('Logout failed');
        }
    } catch (error) {
        console.error('Error logging out:', error);
        showError('Failed to logout. Please try again.');
    }
}

function showLoading() {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.style.display = 'flex';
}

function hideLoading() {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.style.display = 'none';
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function showSuccess(message) {
    const modal = document.getElementById('success-modal');
    const messageElement = document.getElementById('success-message');
    if (modal && messageElement) {
        messageElement.textContent = message;
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 3000);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initWeb3();
        setupEventListeners();
        setupLogoNavigation();
    } catch (error) {
        console.error('Error initializing page:', error);
        showError('Failed to initialize page');
    }
});

// Handle MetaMask events
if (window.ethereum) {
    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            userAccount = accounts[0];
            await updateWalletBalance();
            await loadProfileData();
        } else {
            window.location.reload();
        }
    });

    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });
}