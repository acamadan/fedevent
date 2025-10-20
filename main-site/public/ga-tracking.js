/**
 * Google Analytics Helper Functions for FEDEVENT
 * Centralized tracking for main site
 */

// Track page views
function trackPageView(pageName, pagePath) {
  if (typeof gtag !== 'undefined') {
    gtag('config', 'G-WHNVHXGPHG', {
      'page_title': pageName,
      'page_path': pagePath
    });
  }
}

// Track button clicks
function trackButtonClick(buttonName, category = 'engagement') {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'click', {
      'event_category': category,
      'event_label': buttonName
    });
  }
}

// Track form submissions
function trackFormSubmission(formName, success = true) {
  if (typeof gtag !== 'undefined') {
    gtag('event', success ? 'form_submit' : 'form_error', {
      'event_category': 'forms',
      'event_label': formName,
      'value': success ? 1 : 0
    });
  }
}

// Track conversions
function trackConversion(conversionType, value = 1) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'conversion', {
      'send_to': 'G-WHNVHXGPHG',
      'event_category': 'conversions',
      'event_label': conversionType,
      'value': value
    });
  }
}

// Track user registrations
function trackRegistration(userType = 'hotel') {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'sign_up', {
      'event_category': 'engagement',
      'event_label': userType,
      'method': 'email'
    });
  }
}

// Track logins
function trackLogin(userType = 'hotel') {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'login', {
      'event_category': 'engagement',
      'event_label': userType,
      'method': 'email'
    });
  }
}

// Track search queries
function trackSearch(searchTerm, resultsCount = 0) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'search', {
      'event_category': 'engagement',
      'search_term': searchTerm,
      'results_count': resultsCount
    });
  }
}

// Track file downloads
function trackDownload(fileName, fileType = 'pdf') {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'file_download', {
      'event_category': 'downloads',
      'event_label': fileName,
      'file_extension': fileType
    });
  }
}

// Track external link clicks
function trackExternalLink(url, linkText = '') {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'click', {
      'event_category': 'outbound',
      'event_label': linkText || url,
      'value': url
    });
  }
}

// Track video interactions
function trackVideo(action, videoTitle) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'video_' + action, {
      'event_category': 'video',
      'event_label': videoTitle
    });
  }
}

// Track scroll depth
function trackScrollDepth(percentage) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'scroll', {
      'event_category': 'engagement',
      'event_label': percentage + '%_scroll',
      'value': percentage
    });
  }
}

// Track time on page (call when user leaves)
function trackTimeOnPage(seconds, pageName) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'timing_complete', {
      'event_category': 'engagement',
      'name': 'time_on_page',
      'value': seconds,
      'event_label': pageName
    });
  }
}

// Initialize scroll tracking
(function initScrollTracking() {
  let scrollTracked = {
    '25': false,
    '50': false,
    '75': false,
    '100': false
  };

  window.addEventListener('scroll', function() {
    let scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    
    if (scrollPercentage >= 25 && !scrollTracked['25']) {
      trackScrollDepth(25);
      scrollTracked['25'] = true;
    }
    if (scrollPercentage >= 50 && !scrollTracked['50']) {
      trackScrollDepth(50);
      scrollTracked['50'] = true;
    }
    if (scrollPercentage >= 75 && !scrollTracked['75']) {
      trackScrollDepth(75);
      scrollTracked['75'] = true;
    }
    if (scrollPercentage >= 99 && !scrollTracked['100']) {
      trackScrollDepth(100);
      scrollTracked['100'] = true;
    }
  });
})();

// Track time on page
(function initTimeTracking() {
  let startTime = Date.now();
  
  window.addEventListener('beforeunload', function() {
    let timeSpent = Math.round((Date.now() - startTime) / 1000);
    let pageName = document.title;
    trackTimeOnPage(timeSpent, pageName);
  });
})();

// Make functions globally available
window.trackPageView = trackPageView;
window.trackButtonClick = trackButtonClick;
window.trackFormSubmission = trackFormSubmission;
window.trackConversion = trackConversion;
window.trackRegistration = trackRegistration;
window.trackLogin = trackLogin;
window.trackSearch = trackSearch;
window.trackDownload = trackDownload;
window.trackExternalLink = trackExternalLink;
window.trackVideo = trackVideo;

