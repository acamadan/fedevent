// Footer loader script
document.addEventListener('DOMContentLoaded', function() {
    // Load footer if it doesn't exist
    if (!document.querySelector('footer')) {
        loadFooter();
    }
});

async function loadFooter() {
    try {
        const response = await fetch('/footer.html');
        const footerHTML = await response.text();
        
        // Insert footer before closing body tag
        document.body.insertAdjacentHTML('beforeend', footerHTML);
    } catch (error) {
        console.error('Error loading footer:', error);
    }
}
