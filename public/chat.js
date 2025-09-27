(() => {
  const bubble = document.createElement('div');
  bubble.id = 'chat-bubble';
  bubble.innerHTML = '🧠';
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-head">
      <span>🧠 FEDEVENT Thinking Agent</span>
      <button id="chat-minimize" style="background:none;border:none;color:white;font-size:16px;cursor:pointer;">✖</button>
    </div>
    <div class="chat-body">
      <div id="chat-messages" class="chat-messages"></div>
      <div class="chat-input-area">
        <input id="chat_input" type="text" placeholder="Ask about our services..." />
        <button id="chat_send">Send</button>
      </div>
    </div>`;

  // Service knowledge base
  const serviceResponses = {
    // Government Services
    'government': {
      keywords: ['government', 'gov', 'federal', 'agency', 'official', 'public sector'],
      response: "🏛️ **Government Services:**\n\n• Event planning for federal agencies\n• Contract management with NET30 terms\n• Government-backed purchase orders\n• Emergency response coordination\n• Compliance with federal requirements\n\nWould you like to know more about any specific service?"
    },
    'event planning': {
      keywords: ['event', 'planning', 'conference', 'meeting', 'workshop', 'training'],
      response: "📅 **Event Planning Services:**\n\n• Corporate conferences & workshops\n• Government training sessions\n• Multi-day events with accommodation\n• Meeting space coordination\n• Catering & logistics management\n• AV equipment & technical support\n\nWhat type of event are you planning?"
    },
    'hotels': {
      keywords: ['hotel', 'accommodation', 'rooms', 'stay', 'lodging', 'venue'],
      response: "🏨 **Hotel Network:**\n\n• 2+ Diamond AAA rated properties\n• NET30 payment terms accepted\n• Government per diem rates\n• Group block reservations\n• Indoor facilities required\n• Nationwide coverage\n\nNeed help finding hotels in a specific location?"
    },
    'pricing': {
      keywords: ['price', 'cost', 'rate', 'budget', 'fee', 'payment', 'net30'],
      response: "💰 **Pricing & Payment:**\n\n• NET30 payment terms (mandatory)\n• Government-backed purchase orders\n• 30% discount on per diem rates (preferred)\n• No upfront payments required\n• Transparent pricing structure\n• No hidden fees\n\nWould you like a custom quote for your event?"
    },
    'emergency': {
      keywords: ['emergency', 'urgent', 'asap', 'immediate', 'crisis', 'rush'],
      response: "🚨 **Emergency Services:**\n\n• 24/7 emergency response team\n• Rapid deployment capabilities\n• Crisis accommodation solutions\n• Emergency meeting coordination\n• Priority booking status\n• Immediate confirmation\n\n📞 For urgent needs, call us directly or use our emergency request form!"
    },
    'registration': {
      keywords: ['register', 'sign up', 'join', 'partner', 'apply', 'become'],
      response: "📋 **Registration:**\n\n• **Hotels:** Complete our partnership application\n• **Government Users:** Access our portal\n• **Requirements:** NET30 terms, AAA rating, indoor facilities\n• **Benefits:** Access to government contracts, priority consideration\n\nWhich registration type interests you?"
    },
    'contact': {
      keywords: ['contact', 'phone', 'email', 'reach', 'support', 'help'],
      response: "📞 **Contact Information:**\n\n• **Phone:** (305) 850-7848\n• **Email:** info@fedevent.com\n• **Emergency:** Available 24/7\n• **Response Time:** Within 24 hours (non-emergency)\n• **Business Hours:** Mon-Fri 9AM-6PM EST\n\nHow can we assist you today?"
    },
    'requirements': {
      keywords: ['requirement', 'criteria', 'qualification', 'standard', 'compliance'],
      response: "✅ **Requirements:**\n\n**For Hotels:**\n• AAA 2+ Diamond rating\n• Indoor facilities only\n• NET30 payment acceptance\n• Government PO acceptance\n• No direct bill applications\n\n**For Government Events:**\n• Federal agency authorization\n• Proper documentation\n• Budget approval\n\nNeed clarification on any requirements?"
    },
    // FAQ-based responses
    'creata': {
      keywords: ['creata', 'prime contractor', 'subcontractor', 'contract ownership', 'who owns'],
      response: "🏢 **Contract Structure:**\n\nAll government contracts are awarded to **CREATA Global Event Agency LLC** as the prime contractor. Hotels and service providers serve strictly as **subcontractors** under CREATA.\n\n**Why CREATA acts as prime?**\n• U.S. government issues purchase orders (POs) directly to CREATA Global\n• CREATA manages subcontractors, ensures compliance, and distributes payments\n• Only CREATA must be SAM.gov registered (hotels don't need individual registration)\n\nThis structure ensures federal compliance and streamlined operations."
    },
    'sam': {
      keywords: ['sam.gov', 'sam registration', 'registered', 'system for award management'],
      response: "📋 **SAM.gov Registration:**\n\n**Hotels:** NO registration required! Only CREATA Global, as the prime contractor, must be SAM.gov registered.\n\n**Key Points:**\n• Hotels and vendors are subcontractors\n• No individual SAM registration needed to participate\n• If you choose to register anyway, that's fine\n• All contracts must still be fulfilled through CREATA Global\n• Hotels always act as subcontractors for government task orders\n\nThis simplifies the process for hotels while maintaining compliance."
    },
    'payment terms': {
      keywords: ['payment', 'net30', 'terms', 'deposit', 'advance', 'invoice', 'billing'],
      response: "💰 **Payment Terms:**\n\n**NET30 Terms (Mandatory):**\n• CREATA operates strictly under NET30 payment terms\n• No deposits or upfront payments permitted\n• No advance payments for government contracts\n\n**Payment Process:**\n1. Hotels/vendors invoice CREATA directly\n2. CREATA invoices the U.S. government\n3. Once government payment is received and cleared, CREATA releases funds to subcontractor\n4. NET30 countdown starts when U.S. government approves CREATA's invoice\n5. Generally 2-3 weeks for funds to be received\n\n**Direct Bill:** CREATA does not complete direct bill applications - all POs are issued to CREATA as prime contractor."
    },
    'approval': {
      keywords: ['approval', 'timeline', 'how long', 'process', 'review', 'approved'],
      response: "⏰ **Approval Process:**\n\n**Timeline:** 2-4 business days for most applications\n\n**What We Review:**\n• Proper licensing and compliance\n• U.S. government safety standards\n• CREATA Global subcontractor policies\n• NET30 payment term acceptance\n• Government PO acknowledgment\n\n**Extended Timeline:** If additional verification needed (compliance checks, facility requirements), may take slightly longer.\n\n**Notification:** You'll be notified by email once your profile has been approved.\n\n**No Guarantee:** Approval adds you to CREATA's Hotel Network for consideration, but selection depends on government requirements, availability, pricing, and compliance."
    },
    'contracts': {
      keywords: ['contract', 'award', 'bidding', 'selection', 'how awarded'],
      response: "📄 **Contract Awards:**\n\n**Award Process:**\n• We present the offer to the customer\n• If most advantageous offer, customer extends an award\n• Time frame between winning bids and customer award is the decision period\n\n**Selection Criteria:**\n• Specific requirements of each government task order\n• Compliance, location, and pricing\n• Reliability and past performance\n• Rare that hotels in our network don't meet requirements\n\n**Multiple Opportunities:** Hotels demonstrating reliability and compliance may be awarded multiple opportunities over time.\n\n**Registration:** Complete registration with our network ensures eligibility for future task orders."
    },
    'subcontractor rules': {
      keywords: ['subcontractor', 'rules', 'government contact', 'violation', 'termination'],
      response: "📋 **Subcontractor Rules:**\n\n**Government Contact:**\n• Subcontractors (including hotels) are NOT permitted to contact U.S. government officials directly\n• If government contact info is accidentally shared, immediately notify CREATA and delete the information\n• Direct communication may result in immediate termination from vendor network\n• Only CREATA, as prime contractor, is authorized to engage with government representatives\n\n**Compliance:**\n• Violations of subcontractor policies may result in termination from CREATA's Preferred Vendor Network\n• Compliance with rules is essential to maintaining credibility with U.S. government agencies\n• Includes failing to honor payment terms or contacting government officials directly"
    },
    'profile update': {
      keywords: ['update profile', 'change profile', 'modify', 'edit profile', 'profile changes'],
      response: "✏️ **Profile Updates:**\n\n**Yes, you can update your profile after approval!**\n\n**What You Can Update:**\n• Room counts\n• Meeting space changes\n• Amenities\n• Contact information\n• Service offerings\n\n**Where Updates Are Stored:**\n• Updated information is stored in CREATA's Preferred Vendor Network\n• Ensures accurate matching for future government opportunities\n• Changes are reflected in future contract matching\n\n**Access:** Update your profile anytime through the dashboard or contact support for assistance."
    },
    'account deactivation': {
      keywords: ['deactivate', 'deactivation', 'delete account', 'remove account', 'account removal', 'inactive account'],
      response: "🔒 **Account Deactivation Policy:**\n\n**Deactivation Process:**\n• Accounts can be deactivated by FEDEVENT administrators for policy violations, inactivity, or at the request of the account holder\n• Deactivated accounts cannot access the system or receive contract notifications\n• Account data is retained for 180 days to allow for reactivation if needed\n• After 180 days, all account data is permanently deleted\n\n**Reactivation:**\n• Deactivated accounts can be reactivated within 180 days by contacting FEDEVENT support\n• Reactivation requests must include a valid reason for restoration\n• All account privileges are restored upon successful reactivation\n\n**Data Retention:**\n• Account information is retained for 180 days after deactivation\n• After 180 days, all data is permanently deleted from our systems\n• This policy ensures compliance with data protection regulations\n\n**Contact:** For account deactivation or reactivation requests, contact support@fedevent.com"
    }
  };

  // Initialize thinking agent
  function initChat() {
    const messagesContainer = document.getElementById('chat-messages');
    addMessage('FEDEVENT Thinking Agent', "🧠 Hello! I'm your intelligent thinking agent for FEDEVENT.\n\nI analyze your questions deeply and provide thoughtful, contextual responses about:\n\n• Government contracting & CREATA's role\n• Hotel partnership requirements & processes\n• Payment terms & NET30 compliance\n• Contract awards & bidding strategies\n• SAM.gov registration & federal compliance\n• Emergency services & rapid response\n\nWhat would you like me to think through for you today?", 'bot');
  }

  // Add message to chat
  function addMessage(sender, message, type = 'user') {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageDiv.innerHTML = `
      <div class="message-sender">${sender} <span class="message-time">${time}</span></div>
      <div class="message-content">${message.replace(/\n/g, '<br>')}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Advanced thinking analysis
  function analyzeQuestion(userInput) {
    const input = userInput.toLowerCase();
    
    // Analyze question complexity and context
    const questionAnalysis = {
      complexity: input.length > 50 ? 'complex' : input.length > 20 ? 'moderate' : 'simple',
      context: [],
      intent: 'general',
      urgency: input.includes('urgent') || input.includes('asap') || input.includes('emergency') ? 'high' : 'normal'
    };

    // Determine context areas
    if (input.includes('creata') || input.includes('prime') || input.includes('subcontractor')) {
      questionAnalysis.context.push('contract_structure');
    }
    if (input.includes('sam') || input.includes('registration') || input.includes('compliance')) {
      questionAnalysis.context.push('compliance');
    }
    if (input.includes('payment') || input.includes('net30') || input.includes('invoice') || input.includes('billing')) {
      questionAnalysis.context.push('payment');
    }
    if (input.includes('contract') || input.includes('award') || input.includes('bidding')) {
      questionAnalysis.context.push('contracts');
    }
    if (input.includes('hotel') || input.includes('venue') || input.includes('accommodation')) {
      questionAnalysis.context.push('hotels');
    }
    if (input.includes('government') || input.includes('federal') || input.includes('agency')) {
      questionAnalysis.context.push('government');
    }

    return questionAnalysis;
  }

  // Generate thinking process response
  function generateThinkingResponse(userInput, analysis) {
    let thinkingProcess = "🧠 **Thinking Process:**\n\n";
    
    // Add analysis insights
    thinkingProcess += `**Question Analysis:**\n`;
    thinkingProcess += `• Complexity: ${analysis.complexity}\n`;
    thinkingProcess += `• Context Areas: ${analysis.context.length > 0 ? analysis.context.join(', ') : 'general inquiry'}\n`;
    thinkingProcess += `• Urgency Level: ${analysis.urgency}\n\n`;

    // Add thinking steps
    thinkingProcess += `**Analysis Steps:**\n`;
    thinkingProcess += `1. Understanding your specific needs\n`;
    thinkingProcess += `2. Considering FEDEVENT's processes and policies\n`;
    thinkingProcess += `3. Evaluating compliance requirements\n`;
    thinkingProcess += `4. Synthesizing comprehensive response\n\n`;

    return thinkingProcess;
  }

  // Find best response with thinking analysis
  function findResponse(userInput) {
    const input = userInput.toLowerCase();
    const analysis = analyzeQuestion(userInput);
    
    let bestMatch = null;
    let highestScore = 0;
    let matchedContexts = [];

    // Enhanced keyword matching with context awareness
    for (const [key, service] of Object.entries(serviceResponses)) {
      const score = service.keywords.reduce((acc, keyword) => {
        if (input.includes(keyword)) {
          return acc + keyword.length * 2; // Boost longer keyword matches
        }
        return acc;
      }, 0);

      // Context bonus
      if (analysis.context.includes(key.replace('_', ''))) {
        score += 10;
        matchedContexts.push(key);
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = service;
      }
    }

    // Generate thinking response first
    const thinkingResponse = generateThinkingResponse(userInput, analysis);

    // Return comprehensive response
    if (bestMatch) {
      return thinkingResponse + "**My Analysis:**\n\n" + bestMatch.response + "\n\n💡 **Additional Considerations:**\n\nBased on your question, I recommend reviewing our comprehensive FAQ section for detailed policy information. Would you like me to elaborate on any specific aspect of my analysis?";
    }

    // Advanced fallback for complex questions
    if (analysis.complexity === 'complex' || analysis.context.length > 1) {
      return thinkingResponse + "**My Analysis:**\n\nThis appears to be a multi-faceted question that requires careful consideration of several aspects:\n\n" + 
             analysis.context.map(ctx => {
               switch(ctx) {
                 case 'contract_structure': return "• **Contract Structure** - Understanding CREATA's role as prime contractor\n";
                 case 'compliance': return "• **Compliance** - Federal requirements and registration needs\n";
                 case 'payment': return "• **Payment Terms** - NET30 processes and billing procedures\n";
                 case 'contracts': return "• **Contract Awards** - Bidding and selection processes\n";
                 case 'hotels': return "• **Hotel Partnerships** - Requirements and benefits\n";
                 case 'government': return "• **Government Services** - Federal agency coordination\n";
                 default: return "";
               }
             }).join('') + 
             "\n**Recommendation:** I suggest breaking this down into specific areas. Could you focus on one aspect at a time, or would you prefer a comprehensive overview of all relevant areas?";
    }

    // Standard fallback
    return thinkingResponse + "**My Analysis:**\n\nI understand you're seeking information about FEDEVENT's services. Let me help you explore the most relevant areas:\n\n• **Government Services** - Federal event planning & coordination\n• **Hotel Partnerships** - Join CREATA's Preferred Vendor Network\n• **Contract Structure** - Understanding prime/subcontractor relationships\n• **Payment Terms** - NET30 compliance & billing processes\n• **Compliance Requirements** - SAM.gov, federal standards, policies\n• **Emergency Services** - 24/7 rapid response capabilities\n\n**Thinking Question:** Which area would you like me to analyze in depth for you?";
  }

  // Handle user input
  function handleUserInput() {
    const input = document.getElementById('chat_input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addMessage('You', message, 'user');
    
    // Clear input
    input.value = '';
    
    // Show thinking indicator with longer delay for analysis
    setTimeout(() => {
      const response = findResponse(message);
      addMessage('FEDEVENT Thinking Agent', response, 'bot');
    }, 1000 + Math.random() * 1000); // 1-2 second thinking time
  }

  // Set up event listeners
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(bubble);
    document.body.appendChild(panel);
    
    // Bubble click to open/close
    bubble.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open') && !document.getElementById('chat-messages').hasChildNodes()) {
        initChat();
      }
    });
    
    // Minimize button
    document.getElementById('chat-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.remove('open');
    });
    
    // Send button
    document.getElementById('chat_send').addEventListener('click', handleUserInput);
    
    // Enter key to send
    document.getElementById('chat_input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleUserInput();
      }
    });
    
    // Auto-focus input when chat opens
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (panel.classList.contains('open')) {
            setTimeout(() => {
              document.getElementById('chat_input').focus();
            }, 100);
          }
        }
      });
    });
    
    observer.observe(panel, { attributes: true });
  });
})();


