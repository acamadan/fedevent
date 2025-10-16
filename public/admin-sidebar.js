// Admin Sidebar Functionality
document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.querySelector('.admin-sidebar');
    const sidebarToggle = document.querySelector('.admin-sidebar-toggle');
    const mobileToggle = document.querySelector('.admin-mobile-toggle');
    const mainContent = document.querySelector('.admin-main-content');
    const navItems = document.querySelectorAll('.admin-nav-item');
    
    // Toggle sidebar collapse/expand
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            
            // Save state to localStorage
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('admin-sidebar-collapsed', isCollapsed);
        });
    }
    
    // Mobile toggle
    if (mobileToggle) {
        mobileToggle.addEventListener('click', function() {
            sidebar.classList.toggle('mobile-open');
        });
    }
    
    // Close mobile sidebar when clicking outside
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !mobileToggle.contains(e.target)) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
    
    // Restore sidebar state from localStorage
    const savedState = localStorage.getItem('admin-sidebar-collapsed');
    if (savedState === 'true') {
        sidebar.classList.add('collapsed');
    }
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('mobile-open');
        }
    });
    
    // Set active navigation item
    const currentPath = window.location.pathname;
    navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href && currentPath.includes(href.replace('.html', ''))) {
            item.classList.add('active');
        }
    });
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add loading states to navigation items
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            if (this.getAttribute('href') && !this.getAttribute('href').startsWith('#')) {
                this.style.opacity = '0.7';
                this.style.pointerEvents = 'none';
            }
        });
    });
});

// Utility functions for admin dashboard
window.AdminUtils = {
    // Show notification
    showNotification: function(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `admin-notification admin-notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        // Close button functionality
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    },
    
    // Confirm dialog
    confirm: function(message, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'admin-confirm-overlay';
        overlay.innerHTML = `
            <div class="admin-confirm-dialog">
                <div class="confirm-header">
                    <h3>Confirm Action</h3>
                </div>
                <div class="confirm-body">
                    <p>${message}</p>
                </div>
                <div class="confirm-actions">
                    <button class="btn btn-ghost confirm-cancel">Cancel</button>
                    <button class="btn btn-primary confirm-ok">Confirm</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('.confirm-cancel').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        
        overlay.querySelector('.confirm-ok').addEventListener('click', () => {
            document.body.removeChild(overlay);
            if (callback) callback();
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }
};
