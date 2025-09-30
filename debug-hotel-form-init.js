// Debug script for hotel registration form initialization
console.log('=== HOTEL FORM DEBUG SCRIPT ===');

// Check DOM elements
console.log('1. DOM Elements Check:');
console.log('  - Form element:', !!document.getElementById('hotel-form'));
console.log('  - Pages count:', document.querySelectorAll('.page').length);
console.log('  - Steps count:', document.querySelectorAll('.step').length);
console.log('  - Next button:', !!document.getElementById('nextBtn'));
console.log('  - Back button:', !!document.getElementById('backBtn'));

// Check page visibility
console.log('2. Page Visibility:');
document.querySelectorAll('.page').forEach((page, index) => {
  const isActive = page.classList.contains('active');
  const display = window.getComputedStyle(page).display;
  console.log(`  - Page ${index}: active=${isActive}, display=${display}`);
});

// Check URL parameters
console.log('3. URL Parameters:');
const urlParams = new URLSearchParams(window.location.search);
console.log('  - continue:', urlParams.get('continue'));
console.log('  - signedIn:', urlParams.get('signedIn'));
console.log('  - mode:', urlParams.get('mode'));

// Check session
console.log('4. Session Check:');
const sessionId = localStorage.getItem('fedevent_session');
const userData = localStorage.getItem('fedevent_user');
console.log('  - Session ID exists:', !!sessionId);
console.log('  - User data exists:', !!userData);
if (userData) {
  try {
    const user = JSON.parse(userData);
    console.log('  - User ID:', user.id || user.userId || 'not found');
    console.log('  - Username:', user.username || 'not found');
  } catch (e) {
    console.log('  - User data parse error:', e.message);
  }
}

// Check current active step
console.log('5. Current State:');
const activeStep = document.querySelector('.step.active');
const activePage = document.querySelector('.page.active');
console.log('  - Active step:', activeStep ? activeStep.getAttribute('data-step') : 'none');
console.log('  - Active page:', activePage ? activePage.getAttribute('data-page') : 'none');

// Try to force page 1 to be visible
console.log('6. Forcing Page 1 Visibility:');
const page1 = document.querySelector('.page[data-page="1"]');
if (page1) {
  console.log('  - Page 1 found, current display:', window.getComputedStyle(page1).display);
  
  // Remove active class from all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  // Add active class to page 1
  page1.classList.add('active');
  
  console.log('  - Page 1 display after activation:', window.getComputedStyle(page1).display);
  console.log('  - Page 1 has active class:', page1.classList.contains('active'));
} else {
  console.log('  - Page 1 not found!');
}

// Check for any JavaScript errors
console.log('7. Error Check Complete');
console.log('=== END DEBUG ===');