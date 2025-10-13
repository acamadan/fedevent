// Universal logout function for all user types
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            // Clear any local storage
            localStorage.clear();
            sessionStorage.clear();
            
            // Redirect to appropriate login page
            window.location.href = '/admin-login.html';
        } else {
            console.error('Logout failed');
            // Redirect anyway
            window.location.href = '/admin-login.html';
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Redirect anyway
        window.location.href = '/admin-login.html';
    }
}

