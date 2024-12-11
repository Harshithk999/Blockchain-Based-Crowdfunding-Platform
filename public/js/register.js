document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('register-form');
    const ethereumAddressInput = document.getElementById('ethereumAddress');

    // MetaMask Connection
    async function connectMetamask() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ 
                    method: 'eth_requestAccounts' 
                });
                if (accounts.length > 0) {
                    ethereumAddressInput.value = accounts[0];
                }
            } catch (error) {
                showError('Failed to connect to MetaMask');
            }
        } else {
            showError('Please install MetaMask');
        }
    }

    // Connect MetaMask on page load and when input is clicked
    connectMetamask();
    ethereumAddressInput.addEventListener('click', connectMetamask);

    // Form Submission
    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const ethereumAddress = ethereumAddressInput.value;
        const userType = document.getElementById('userType').value;

        if (!username || !password || !ethereumAddress || !userType) {
            showError('All fields are required');
            return;
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(ethereumAddress)) {
            showError('Invalid Ethereum address');
            return;
        }

        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    password,
                    ethereumAddress,
                    userType
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Registration successful! Please login.');
                window.location.href = '/login';
            } else {
                showError(data.error || 'Registration failed');
            }
        } catch (error) {
            console.error('Error:', error);
            showError('Error during registration. Please try again.');
        }
    });
});

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

if (window.ethereum) {
    window.ethereum.on('accountsChanged', function(accounts) {
        const ethereumAddressInput = document.getElementById('ethereumAddress');
        if (accounts.length > 0) {
            ethereumAddressInput.value = accounts[0];
        } else {
            ethereumAddressInput.value = '';
        }
    });
}