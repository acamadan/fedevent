// Shared navigation injection for all public pages (except admin pages should not include this file)
(function() {
  function buildHeader() {
    const header = document.createElement('header');
    const nav = document.createElement('nav');
    nav.className = 'container';
    
    // Logo + dropdown (matches landing/resources pages)
    const logoMenuWrap = document.createElement('div');
    logoMenuWrap.className = 'logo-menu';
    logoMenuWrap.style.position = 'relative';

    const logo = document.createElement('a');
    logo.href = 'javascript:void(0)';
    logo.className = 'logo';
    logo.innerHTML = 'FEDEVENT <span style="font-size: 0.7em;">▾</span>';
    logo.onclick = function(e){ e.preventDefault(); e.stopPropagation(); toggleLogoDropdown(e); };

    const logoDropdown = document.createElement('div');
    logoDropdown.className = 'logo-dropdown';
    logoDropdown.id = 'logoDropdown';
    logoDropdown.style.position = 'absolute';
    logoDropdown.style.top = '100%';
    logoDropdown.style.left = '0';
    logoDropdown.style.background = 'white';
    logoDropdown.style.border = '1px solid #e5e7eb';
    logoDropdown.style.borderRadius = '8px';
    logoDropdown.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    logoDropdown.style.minWidth = '200px';
    logoDropdown.style.display = 'none';
    logoDropdown.style.zIndex = '1000';

    const ddLinks = [
      { href: '/', label: 'Home' },
      { href: '/hotel-signup.html', label: 'Hotel Registration' },
      { href: '/hotel-login.html', label: 'Hotel Portal' },
      { href: '/government-portal.html', label: 'Government Portal' },
      { href: '/resources.html', label: 'Resources' },
      { href: '/about.html', label: 'About' }
    ];
    ddLinks.forEach((l, idx) => {
      const a = document.createElement('a');
      a.href = l.href;
      a.textContent = l.label;
      a.style.display = 'block';
      a.style.padding = '12px 16px';
      a.style.textDecoration = 'none';
      a.style.color = '#374151';
      if (idx < ddLinks.length - 1) a.style.borderBottom = '1px solid #f3f4f6';
      logoDropdown.appendChild(a);
    });

    logoMenuWrap.appendChild(logo);
    logoMenuWrap.appendChild(logoDropdown);

    const ul = document.createElement('ul');
    ul.className = 'nav-links';

    const links = [
      { href: '/hotel-signup.html', label: 'Hotel Registration' },
      { href: '/government-portal.html', label: 'Government Portal' },
      { href: '/resources.html', label: 'Resources' },
      { href: '/about.html', label: 'About' },
      { href: '/hotel-login.html', label: 'Hotel Portal' }
    ];

    links.forEach(l => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = l.href;
      a.textContent = l.label;
      li.appendChild(a);
      ul.appendChild(li);
    });

    // User menu - EXACT structure from landing page
    const liUser = document.createElement('li');
    liUser.id = 'userMenu';
    liUser.className = 'user-menu';
    liUser.style.display = 'none';

    const trigger = document.createElement('a');
    trigger.className = 'user-trigger';
    trigger.href = 'javascript:void(0)';
    trigger.onclick = function(e){ e.preventDefault(); e.stopPropagation(); toggleUserDropdown(e); };

    const avatar = document.createElement('span');
    avatar.className = 'user-avatar';
    avatar.id = 'userInitial';
    avatar.textContent = 'U';

    const name = document.createElement('span');
    name.id = 'userNameLabel';
    name.textContent = 'User';

    const caret = document.createElement('span');
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';

    trigger.appendChild(avatar);
    trigger.appendChild(name);
    trigger.appendChild(caret);

    const dd = document.createElement('div');
    dd.className = 'user-dropdown';
    dd.id = 'userDropdown';

    const portalLink = document.createElement('a');
    portalLink.href = '/hotel-dashboard.html';
    portalLink.textContent = 'Hotel Portal';

    const settingsLink = document.createElement('a');
    settingsLink.href = '/user-profile.html';
    settingsLink.textContent = 'User Settings';

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Logout';
    logoutBtn.onclick = function(){
      localStorage.removeItem('fedevent_session');
      localStorage.removeItem('fedevent_user');
      window.location.href = '/hotel-login.html';
    };

    dd.appendChild(portalLink);
    dd.appendChild(settingsLink);
    dd.appendChild(logoutBtn);

    liUser.appendChild(trigger);
    liUser.appendChild(dd);
    ul.appendChild(liUser);

    nav.appendChild(logoMenuWrap);
    nav.appendChild(ul);
    header.appendChild(nav);
    return header;
  }

  function buildFooter() {
    const footer = document.createElement('footer');
    footer.id = 'contact';

    const container = document.createElement('div');
    container.className = 'container';

    const content = document.createElement('div');
    content.className = 'footer-content';

    const section1 = document.createElement('div');
    section1.className = 'footer-section';
    const s1h3 = document.createElement('h3');
    s1h3.textContent = 'FEDEVENT';
    const s1p = document.createElement('p');
    s1p.textContent = 'Professional event planning services for U.S. Government agencies.';
    section1.appendChild(s1h3);
    section1.appendChild(s1p);

    const section2 = document.createElement('div');
    section2.className = 'footer-section';
    const s2h3 = document.createElement('h3');
    s2h3.textContent = 'Services';
    const a1 = document.createElement('a'); a1.href = '/hotel-signup.html'; a1.textContent = 'Hotel Registration';
    const a2 = document.createElement('a'); a2.href = '/#services'; a2.textContent = 'Event Planning';
    const a3 = document.createElement('a'); a3.href = '/#features'; a3.textContent = 'Venue Matching';
    section2.appendChild(s2h3);
    section2.appendChild(a1);
    section2.appendChild(a2);
    section2.appendChild(a3);

    const section3 = document.createElement('div');
    section3.className = 'footer-section footer-contact';
    const s3h3 = document.createElement('h3'); s3h3.textContent = 'Contact';
    const s3p1 = document.createElement('p'); s3p1.textContent = 'Email: info@fedevent.com';
    const s3p2 = document.createElement('p'); s3p2.textContent = 'Phone: 3058507848';
    section3.appendChild(s3h3);
    section3.appendChild(s3p1);
    section3.appendChild(s3p2);

    content.appendChild(section1);
    content.appendChild(section2);
    content.appendChild(section3);

    const bottom = document.createElement('div');
    bottom.className = 'footer-bottom';
    const b1 = document.createElement('p'); b1.textContent = 'fedevent.com is a service of CREATA Global Event Agency LLC';
    const b2 = document.createElement('p'); b2.innerHTML = `\u00A9 ${new Date().getFullYear()} FEDEVENT. All rights reserved.`;
    bottom.appendChild(b1);
    bottom.appendChild(b2);

    container.appendChild(content);
    container.appendChild(bottom);
    footer.appendChild(container);
    return footer;
  }

  function toggleUserDropdown(e) {
    e.preventDefault();
    e.stopPropagation();
    const dd = document.getElementById('userDropdown');
    if (!dd) return;
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  }
  window.toggleUserDropdown = toggleUserDropdown;

  function toggleLogoDropdown(e) {
    e.preventDefault();
    e.stopPropagation();
    const dd = document.getElementById('logoDropdown');
    if (!dd) return;
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  }
  window.toggleLogoDropdown = toggleLogoDropdown;

  function loadUserMenu(){
    try {
      const sessionId = localStorage.getItem('fedevent_session');
      const raw = localStorage.getItem('fedevent_user');
      if (!sessionId || !raw) return;
      const user = JSON.parse(raw);
      let name = (user.first_name && user.last_name)
        ? (user.first_name + ' ' + user.last_name)
        : (user.first_name || user.username || user.email || 'User');
      // Remove "Hotel" and "User" from the name display
      name = name.replace(/\b(Hotel|User)\b/gi, '').trim();
      const initial = (name || 'U').trim().charAt(0).toUpperCase();
      const menu = document.getElementById('userMenu');
      const label = document.getElementById('userNameLabel');
      const avatar = document.getElementById('userInitial');
      if (menu && label && avatar) {
        label.textContent = name;
        avatar.textContent = initial;
        menu.style.display = 'list-item';
      }
    } catch (e) {}
  }

  function ensureHeader(){
    const isAdmin = /\badmin\-/.test(location.pathname) || /\/admin/.test(location.pathname);
    if (isAdmin) return; // do nothing on admin pages

    const existingHeader = document.querySelector('header');
    const newHeader = buildHeader();
    if (existingHeader) {
      existingHeader.replaceWith(newHeader);
    } else {
      document.body.insertBefore(newHeader, document.body.firstChild);
    }
    loadUserMenu();

    // Close dropdowns on outside click
    document.addEventListener('click', function(evt){
      const dd = document.getElementById('userDropdown');
      const um = document.getElementById('userMenu');
      if (dd && um && !um.contains(evt.target)) dd.style.display = 'none';

      const logoDd = document.getElementById('logoDropdown');
      const logoMenu = document.querySelector('.logo-menu');
      if (logoDd && logoMenu && !logoMenu.contains(evt.target)) logoDd.style.display = 'none';
    });
  }

  function ensureFooter(){
    const isAdmin = /\badmin\-/.test(location.pathname) || /\/admin/.test(location.pathname);
    if (isAdmin) return; // do nothing on admin pages

    let footer = document.querySelector('footer');
    const newFooter = buildFooter();

    if (!footer) {
      document.body.appendChild(newFooter);
    } else {
      // Normalize existing footer to match shared template
      footer.replaceWith(newFooter);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ ensureHeader(); ensureFooter(); });
  } else {
    ensureHeader();
    ensureFooter();
  }
})();