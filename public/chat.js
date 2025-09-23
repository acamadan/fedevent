(() => {
  const bubble = document.createElement('div');
  bubble.id = 'chat-bubble';
  bubble.innerHTML = '💬';
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-head">
      <span>💬 FEDEVENT Assistant</span>
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
    }
  };

  // Initialize chat
  function initChat() {
    const messagesContainer = document.getElementById('chat-messages');
    addMessage('FEDEVENT Assistant', "👋 Welcome to FEDEVENT! I'm here to help with:\n\n• Government event planning\n• Hotel partnerships\n• Emergency services\n• Pricing information\n• Registration process\n\nHow can I assist you today?", 'bot');
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

  // Find best response based on user input
  function findResponse(userInput) {
    const input = userInput.toLowerCase();
    let bestMatch = null;
    let highestScore = 0;

    // Check for exact keyword matches
    for (const [key, service] of Object.entries(serviceResponses)) {
      const score = service.keywords.reduce((acc, keyword) => {
        if (input.includes(keyword)) {
          return acc + keyword.length; // Longer keywords get higher scores
        }
        return acc;
      }, 0);

      if (score > highestScore) {
        highestScore = score;
        bestMatch = service;
      }
    }

    // Return best match or default response
    if (bestMatch) {
      return bestMatch.response;
    }

    // Default response with suggestions
    return "🤔 I'd be happy to help! Here are some topics I can assist with:\n\n• **Government Services** - Federal event planning\n• **Hotel Partnerships** - Join our network\n• **Emergency Services** - 24/7 rapid response\n• **Pricing & Payments** - NET30 terms & rates\n• **Requirements** - Qualification criteria\n• **Contact Information** - Get in touch\n\nPlease type any of these topics or ask a specific question!";
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
    
    // Show typing indicator
    setTimeout(() => {
      const response = findResponse(message);
      addMessage('FEDEVENT Assistant', response, 'bot');
    }, 500);
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


