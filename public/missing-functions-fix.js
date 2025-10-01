// Missing Functions Fix for Hotel Registration Form
// Add this script at the end of hotel-registration.html before closing </body> tag

console.log('🔧 Loading missing functions fix...');

// SIGNER DUAL INFO VALIDATION FUNCTION
window.checkSignerInfo = function() {
  console.log('✅ Checking signer dual info...');
  
  const role0 = document.querySelector('[name="sign_contacts[0][role]"]');
  const role1 = document.querySelector('[name="sign_contacts[1][role]"]');
  
  if (!role0 || !role1) {
    console.log('Role selectors not found');
    return true; // Skip validation if elements don't exist
  }
  
  const roleValue0 = role0.value;
  const roleValue1 = role1.value;
  
  console.log('Signer roles check:', { role0: roleValue0, role1: roleValue1 });
  
  // Check if both roles are filled and they're the same
  if (roleValue0 && roleValue1 && roleValue0 === roleValue1) {
    console.log('🚨 DUPLICATE ROLES DETECTED!');
    
    // Show entrance notice modal
    const modal = document.createElement('div');
    modal.id = 'roleConflictModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    modal.innerHTML = `
      <div style="
        background: white;
        padding: 30px;
        border-radius: 15px;
        max-width: 500px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        text-align: center;
      ">
        <div style="font-size: 3rem; margin-bottom: 15px;">⚠️</div>
        <h3 style="color: #dc2626; margin-bottom: 15px;">SIGNER DUAL INFO ENTRANCE NOTICE</h3>
        <p style="margin-bottom: 20px; line-height: 1.5;">
          <strong>Role Conflict Detected!</strong><br><br>
          You cannot assign the same role to both contacts.<br>
          Each contact must have a different role:
        </p>
        <ul style="text-align: left; margin: 15px 0; padding-left: 20px;">
          <li><strong>Contact 1:</strong> Select "Signer" or "Approver"</li>
          <li><strong>Contact 2:</strong> Select the other role</li>
        </ul>
        <p style="margin-top: 20px; font-size: 0.9rem; color: #666;">
          Please correct this before proceeding.
        </p>
        <button onclick="document.getElementById('roleConflictModal') && document.getElementById('roleConflictModal').remove()" style="
          background: #dc2626;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 15px;
        ">OK, I'll Fix This</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus on the first role field
    setTimeout(() => {
      role0.focus();
      role0.style.border = '2px solid #dc2626';
      role1.style.border = '2px solid #dc2626';
      
      // Clear highlights when changed
      const clearHighlight = () => {
        role0.style.border = '';
        role1.style.border = '';
      };
      role0.addEventListener('change', clearHighlight, { once: true });
      role1.addEventListener('change', clearHighlight, { once: true });
    }, 500);
    
    return false; // Prevent proceeding
  }
  
  console.log('✅ Signer info validation passed');
  return true;
};

// UNFILLED FIELD VALIDATION FUNCTION
window.validateRequiredFields = function() {
  console.log('✅ Validating required fields...');
  
  const currentPage = document.querySelector('.page.active');
  if (!currentPage) {
    console.error('No active page found for validation!');
    return false;
  }
  
  const requiredFields = currentPage.querySelectorAll('[required]');
  const missingFields = [];
  
  requiredFields.forEach(field => {
    // Skip hidden fields
    const isHidden = field.closest('[style*="display: none"]') || 
                    field.closest('[style*="display:none"]') ||
                    field.offsetParent === null;
    
    if (!isHidden && (!field.value || !field.value.trim())) {
      // Get field label
      let fieldLabel = field.name || field.id || 'Unknown field';
      const label = document.querySelector(`label[for="${field.id}"]`) || 
                   field.closest('.form-group')?.querySelector('label');
      if (label) {
        fieldLabel = label.textContent.replace('*', '').trim();
      }
      
      missingFields.push({
        element: field,
        label: fieldLabel
      });
    }
  });
  
  if (missingFields.length > 0) {
    console.log('🚨 Missing required fields:', missingFields.map(f => f.label));
    
    // Show unfilled field notice
    showUnfilledFieldNotice(missingFields);
    return false;
  }
  
  console.log('✅ All required fields validation passed');
  return true;
};

// UNFILLED FIELD NOTICE FUNCTION
window.showUnfilledFieldNotice = function(missingFields) {
  console.log('📋 Showing unfilled field notice for:', missingFields.length, 'fields');
  
  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const fieldsList = missingFields.map(f => `<li>${f.label}</li>`).join('');
  
  modal.innerHTML = `
    <div style="
      background: white;
      padding: 30px;
      border-radius: 15px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      text-align: center;
    ">
      <div style="font-size: 3rem; margin-bottom: 15px;">📝</div>
      <h3 style="color: #dc2626; margin-bottom: 15px;">UNFILLED FIELD NOTICE</h3>
      <p style="margin-bottom: 20px; line-height: 1.5;">
        <strong>Please complete the following required fields:</strong>
      </p>
      <ul style="text-align: left; margin: 15px 0; padding-left: 20px; color: #dc2626; font-weight: 600;">
        ${fieldsList}
      </ul>
      <p style="margin-top: 20px; font-size: 0.9rem; color: #666;">
        All required fields must be completed before proceeding to the next page.
      </p>
      <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
        <button onclick="window.goToFirstMissingField()" style="
          background: #059669;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        ">Go to First Field</button>
        <button onclick="this.closest('div').remove()" style="
          background: #6b7280;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        ">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Store missing fields for navigation
  window.currentMissingFields = missingFields;
};

// GO TO FIRST MISSING FIELD FUNCTION
window.goToFirstMissingField = function() {
  if (window.currentMissingFields && window.currentMissingFields.length > 0) {
    const firstField = window.currentMissingFields[0].element;
    
    // Close modal
    document.querySelector('div[style*="position: fixed"]')?.remove();
    
    // Scroll to and focus field
    firstField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    setTimeout(() => {
      firstField.focus();
      
      // Highlight field
      firstField.style.border = '2px solid #dc2626';
      firstField.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.1)';
      
      // Remove highlight when user starts typing
      const removeHighlight = () => {
        firstField.style.border = '';
        firstField.style.boxShadow = '';
        firstField.removeEventListener('input', removeHighlight);
      };
      firstField.addEventListener('input', removeHighlight);
    }, 500);
  }
};

// ENHANCED SAVE DRAFT FUNCTION (if original is broken)
window.ensureHandleSaveDraft = function() {
  if (typeof window.handleSaveDraft !== 'function') {
    console.log('🔧 Restoring handleSaveDraft function...');
    
    window.handleSaveDraft = function(type = 'manual') {
      console.log('💾 Save draft called, type:', type);
      
      try {
        // Get all form data
        const form = document.getElementById('hotel-form');
        if (!form) {
          console.error('Form not found!');
          return false;
        }
        
        const formData = new FormData(form);
        const data = {};
        
        // Convert FormData to object
        for (const [key, value] of formData.entries()) {
          if (data[key]) {
            if (Array.isArray(data[key])) {
              data[key].push(value);
            } else {
              data[key] = [data[key], value];
            }
          } else {
            data[key] = value;
          }
        }
        
        const draftData = {
          formData: data,
          currentStep: window.current || 0,
          timestamp: new Date().toISOString(),
          userId: window.currentUserId || 'anonymous'
        };
        
        // Save to localStorage
        localStorage.setItem('hotel_registration_draft', JSON.stringify(draftData));
        localStorage.setItem(`hotel_registration_draft_${window.currentUserId || 'anonymous'}`, JSON.stringify(draftData));
        localStorage.setItem('hotel_registration_current_page', (window.current || 0).toString());
        localStorage.setItem('hotel_registration_last_save', new Date().toISOString());
        
        console.log('💾 Draft saved to localStorage, fields:', Object.keys(data).length);
        
        // Show success message for manual saves
        if (type === 'manual') {
          const toast = document.createElement('div');
          toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#10b981; color:white; padding:12px 20px; border-radius:8px; z-index:10000; font-weight:600;';
          toast.textContent = '✅ Draft saved successfully!';
          document.body.appendChild(toast);
          
          setTimeout(() => {
            toast.remove();
          }, 3000);
        }
        
        return true;
        
      } catch (error) {
        console.error('💾 Save draft error:', error);
        return false;
      }
    };
  }
};

// ENHANCED NEXT BUTTON HANDLER
window.enhancedHandleNextClick = function() {
  console.log('🔄 Enhanced next button clicked');
  
  // Check signer info first
  if (!window.checkSignerInfo()) {
    console.log('🚨 Signer info validation failed');
    return;
  }
  
  // Check required fields
  if (!window.validateRequiredFields()) {
    console.log('🚨 Required fields validation failed');
    return;
  }
  
  // All validations passed - proceed with original next logic
  console.log('✅ All validations passed, proceeding...');
  
  // Auto-save before moving to next page
  if (window.signedIn || window.currentUserId) {
    window.handleSaveDraft && window.handleSaveDraft('auto-next');
  }
  
  // Call original next function if it exists
  if (typeof window.originalHandleNextClick === 'function') {
    window.originalHandleNextClick();
  } else {
    // Basic next page logic as fallback
    const totalPages = document.querySelectorAll('.page').length;
    const current = window.current || 0;
    
    if (current < totalPages - 1) {
      window.current = current + 1;
      
      // Hide all pages
      document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });
      
      // Show target page
      const targetPage = document.querySelector(`[data-page="${window.current}"]`);
      if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'block';
      }
      
      window.scrollTo(0, 0);
    }
  }
};

// AUTO-INITIALIZE WHEN DOM IS READY
document.addEventListener('DOMContentLoaded', function() {
  console.log('🔧 Initializing missing functions fix...');
  
  // Restore save draft function if missing
  window.ensureHandleSaveDraft();
  
  // Override next button handler if needed
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    // Store original handler if it exists
    if (window.handleNextClick) {
      window.originalHandleNextClick = window.handleNextClick;
    }
    
    // Replace with enhanced handler
    window.handleNextClick = window.enhancedHandleNextClick;
    
    console.log('🔧 Enhanced next button handler installed');
  }
  
  // Set up role validation listeners
  const role0 = document.querySelector('[name="sign_contacts[0][role]"]');
  const role1 = document.querySelector('[name="sign_contacts[1][role]"]');
  
  if (role0 && role1) {
    console.log('🔧 Setting up role validation listeners...');
    
    function handleRoleChange(changedElement) {
      setTimeout(() => {
        window.checkSignerInfo();
      }, 100);
    }
    
    role0.addEventListener('change', () => handleRoleChange(role0));
    role1.addEventListener('change', () => handleRoleChange(role1));
    
    console.log('✅ Role validation listeners installed');
  }
  
  console.log('✅ Missing functions fix completed!');
});

// EMERGENCY RESTORE FUNCTION (run immediately)
(function() {
  console.log('🚨 Emergency function restore running...');
  
  // Force restore draft function if completely missing
  if (typeof window.handleSaveDraft !== 'function') {
    console.log('🚨 Critical: handleSaveDraft missing, emergency restore...');
    window.ensureHandleSaveDraft();
  }
  
  // Force check that save draft button works
  setTimeout(() => {
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn && !saveDraftBtn.onclick) {
      console.log('🚨 Save draft button has no handler, fixing...');
      saveDraftBtn.onclick = () => window.handleSaveDraft('manual');
    }
  }, 1000);
  
  console.log('✅ Emergency restore completed');
})();

console.log('✅ Missing functions fix script loaded successfully!');