document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Store user type and other info in localStorage
            localStorage.setItem('userType', data.userType);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('ethereumAddress', data.ethereumAddress);

            // Redirect based on user type
            if (data.userType === 'creator') {
                window.location.href = '/creator-dashboard';
            } else {
                window.location.href = '/investor-dashboard';
            }
        } else {
            alert(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred during login');
    }
});