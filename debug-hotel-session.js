// Debug script to check session flow in hotel registration
console.log('=== Hotel Registration Session Debug ===');

// Check localStorage values
console.log('\n1. LocalStorage Values:');
const sessionId = localStorage.getItem('fedevent_session');
const user = localStorage.getItem('fedevent_user');
const hotel = localStorage.getItem('fedevent_hotel');

console.log('fedevent_session:', sessionId ? `${sessionId.substring(0, 20)}...` : 'NOT SET');
console.log('fedevent_user:', user ? 'SET' : 'NOT SET');
console.log('fedevent_hotel:', hotel ? 'SET' : 'NOT SET');

// Check if we're on the hotel registration page
console.log('\n2. Page Context:');
console.log('Current page:', window.location.href);
console.log('Form exists:', !!document.querySelector('form#hotel-registration-form'));

// Check session with server if we have one
if (sessionId) {
  console.log('\n3. Session Validation:');
  fetch('/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${sessionId}`
    }
  })
  .then(response => {
    console.log('Session check status:', response.status);
    return response.json();
  })
  .then(data => {
    console.log('Session check result:', data);
  })
  .catch(error => {
    console.log('Session check error:', error);
  });
} else {
  console.log('\n3. No session to validate');
}

// Check for any session-related errors in the console
console.log('\n4. Console errors (check browser console for details)');