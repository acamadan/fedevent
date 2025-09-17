(function(){
  console.log("[CREATA] patch-auto-apply.js loaded");

  function setVal(el, val){
    if (!el) return false;
    if (typeof val === 'boolean') val = val ? 'Yes' : 'No';
    if (val == null || val === '') return false;
    if (el.type === 'checkbox') {
      el.checked = /^y(es)?|true|1$/i.test(String(val));
    } else {
      el.value = String(val);
    }
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }

  function applyFields(fields){
    if (!fields || typeof fields !== 'object') return 0;

    const keyMap = {
      hotel_name: 'hotel_name',
      brand: 'brand',
      chain: 'chain',
      management_company: 'management_company',
      website: 'website',
      street_address: 'street_address',
      address: 'street_address',
      city: 'city',
      state: 'state',
      province: 'state',
      postal_code: 'postal_code',
      zip: 'postal_code',
      country: 'country',
      year_built: 'year_built',
      last_renovation_year: 'last_renovation_year',
      email: 'email',      // left column Email *
      phone: 'phone',      // left column Phone
      meeting_space_sqft: 'meeting_space_sqft',
      total_meeting_space_sqft: 'total_meeting_space_sqft',
      largest_room_sqft: 'largest_room_sqft',
      ballroom_sqft: 'ballroom_sqft',
      pool: 'pool',
      gym: 'gym',
      business_center: 'business_center',
    };

    let filled = 0;

    for (const [rawKey, val] of Object.entries(fields)) {
      const key = keyMap[rawKey] || rawKey;
      const el =
        document.getElementById(key) ||
        document.querySelector(`[name="${key}"]`) ||
        document.querySelector(`input[id$="${key}"], input[name$="${key}"]`);
      if (setVal(el, val)) filled++;
    }

    // Fix "SW Washington" → "Washington" (DC)
    const cityEl = document.getElementById('city') || document.querySelector('[name="city"]');
    const stateEl = document.getElementById('state') || document.querySelector('[name="state"]');
    if (cityEl && /^(?:N|S|E|W|NE|NW|SE|SW)\s+Washington\b/i.test(cityEl.value)) {
      cityEl.value = 'Washington';
      if (stateEl && !stateEl.value) stateEl.value = 'DC';
      cityEl.dispatchEvent(new Event('input',{bubbles:true}));
      cityEl.dispatchEvent(new Event('change',{bubbles:true}));
    }

    // Update on-page status if present
    const banner = document.querySelector('#autofill-status,.autofill-status');
    if (banner) banner.textContent = `Autofilled ${filled} field(s).`;

    console.log(`[CREATA] filled ${filled} field(s)`);
    return filled;
  }

  // If site already provides applyAutofill, keep it but fall back to ours
  const originalApply = window.applyAutofill;
  window.applyAutofill = function(fields){
    try { return (originalApply ? originalApply(fields) : 0) || applyFields(fields); }
    catch(e){ console.warn("[CREATA] applyAutofill error, using fallback", e); return applyFields(fields); }
  };

  // Intercept fetch to catch /api/autofill responses everywhere
  const origFetch = window.fetch;
  window.fetch = async function(...args){
    const resp = await origFetch.apply(this, args);
    try {
      const url = (args[0] && args[0].url) || args[0];
      if (typeof url === 'string' && url.includes('/api/autofill')) {
        resp.clone().json().then(data=>{
          if (data && data.fields) window.applyAutofill(data.fields);
        }).catch(()=>{ /* not JSON or no fields */});
      }
    } catch(e) { /* ignore */ }
    return resp;
  };

  // Optional: nuke any overzealous SW cache during dev
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  }
})();
