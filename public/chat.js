(() => {
  // Conversation history to maintain context
  let conversationHistory = [];
  let isProcessing = false;
  
  // Voice features
  let recognition = null;
  let synthesis = window.speechSynthesis;
  let isListening = false;
  let isVoiceOutputEnabled = false;
  let currentUtterance = null;
  let isSpeaking = false;
  let isPaused = false;

  // Create chat bubble
  const bubble = document.createElement('div');
  bubble.id = 'chat-bubble';
  bubble.innerHTML = `
    <video id="danaVideo" src="/dana.mp4" alt="DANA" class="dana-video" playsinline></video>
    <div class="bubble-pulse"></div>
  `;

  // Create chat panel
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-head">
      <div class="chat-head-content">
        <span class="chat-title">
          <img src="/dana.mp4" alt="DANA" class="chat-dana-icon" style="width: 24px; height: 24px; border-radius: 50%; margin-right: 8px; object-fit: cover;">
          D.A.N.A FEDEVENT AI
        </span>
        <span class="chat-subtitle">Here to help you every step of the way</span>
      </div>
      <button id="chat-minimize" aria-label="Close chat">✖</button>
    </div>
    <div class="chat-body">
      <div id="chat-messages" class="chat-messages"></div>
      <div id="chat-typing" class="chat-typing" style="display: none;">
        <span></span><span></span><span></span>
      </div>
      <div class="chat-input-area">
        <button id="chat_voice_input" aria-label="Voice input" title="Click to speak">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 12.5a2.5 2.5 0 002.5-2.5V5a2.5 2.5 0 00-5 0v5a2.5 2.5 0 002.5 2.5zM6 9v1a4 4 0 008 0V9M10 14v3M7 17h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <input id="chat_input" type="text" placeholder="Ask me anything about registration, policies, or how to fill out forms..." autocomplete="off" />
        <div class="voice-controls" style="display: flex; gap: 4px;">
          <button id="chat_voice_play" aria-label="Play voice" title="Play voice response" style="display: none;">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M6 3l12 7-12 7V3z" fill="currentColor"/>
            </svg>
          </button>
          <button id="chat_voice_pause" aria-label="Pause voice" title="Pause voice response" style="display: none;">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M6 4h2v12H6V4zm6 0h2v12h-2V4z" fill="currentColor"/>
            </svg>
          </button>
          <button id="chat_voice_stop" aria-label="Stop voice" title="Stop voice response" style="display: none;">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M4 4h12v12H4V4z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <button id="chat_voice_output" aria-label="Toggle voice output" title="Enable voice responses">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M8 6l-4 4H1v4h3l4 4V6zM15 10c0-1.657-1.343-3-3-3M15 10c0 1.657-1.343 3-3 3M17 10c0-2.761-2.239-5-5-5M17 10c0 2.761-2.239 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button id="chat_send" aria-label="Send message">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M2 10L18 2L12 18L10 11L2 10Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="chat-footer">
      <span class="chat-footer-text">Powered by AI • Available 24/7</span>
      <button id="chat-clear" aria-label="Clear chat" title="Start a new conversation">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M7 7v5M9 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Clear Chat
      </button>
    </div>
  `;

  // Get current page context
  function getCurrentPageContext() {
    const path = window.location.pathname;
    const pageName = path.split('/').pop().replace('.html', '') || 'home';
    
    // Detect if user is on a form
    const forms = document.querySelectorAll('form');
    const formContext = {};
    
    if (forms.length > 0) {
      formContext.hasForm = true;
      formContext.formFields = [];
      
      // Get form field information
      forms.forEach(form => {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
          if (input.name || input.id) {
            const label = form.querySelector(`label[for="${input.id}"]`);
            formContext.formFields.push({
              name: input.name || input.id,
              type: input.type || input.tagName.toLowerCase(),
              label: label ? label.textContent.trim() : '',
              required: input.required || input.hasAttribute('required')
            });
          }
        });
      });
    }
    
    return {
      page: pageName,
      url: window.location.href,
      formContext
    };
  }

  // Initialize chat with welcome message
  function initChat() {
    const messagesContainer = document.getElementById('chat-messages');
    
    if (messagesContainer.children.length === 0) {
      const pageContext = getCurrentPageContext();
      let welcomeMessage = `👋 Hello! I'm Dana — FEDEVENT's AI assistant.\n\n`;
      
      if (pageContext.formContext.hasForm) {
        welcomeMessage += `I see you're on the ${pageContext.page} page with a form. I can help you:\n\n`;
        welcomeMessage += `• Understand each field in the form\n`;
        welcomeMessage += `• Explain what information is required\n`;
        welcomeMessage += `• Answer questions about policies and terms\n`;
        welcomeMessage += `• Guide you through the registration process\n\n`;
      } else {
        welcomeMessage += `I'm here to help you with:\n\n`;
        welcomeMessage += `• Registration and partnership information\n`;
        welcomeMessage += `• Company policies and payment terms\n`;
        welcomeMessage += `• Contract structure and processes\n`;
        welcomeMessage += `• Technical support and navigation\n\n`;
      }
      
      welcomeMessage += `What can I help you with today?`;
      
      addMessage('Dana', welcomeMessage, 'bot');
    }
  }

  // Add message to chat
  function addMessage(sender, message, type = 'user') {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Format message with markdown-like styling
    let formattedMessage = message
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/• /g, '<span class="bullet">•</span> ');
    
    messageDiv.innerHTML = `
      <div class="message-avatar">${type === 'bot' ? '🤖' : '👤'}</div>
      <div class="message-bubble">
        <div class="message-sender">${sender}</div>
        <div class="message-content">${formattedMessage}</div>
        <div class="message-time">${time}</div>
      </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Show typing indicator
  function showTypingIndicator(show = true) {
    const typingIndicator = document.getElementById('chat-typing');
    const messagesContainer = document.getElementById('chat-messages');
    
    if (show) {
      typingIndicator.style.display = 'flex';
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } else {
      typingIndicator.style.display = 'none';
    }
  }

  // Send message to AI backend
  async function sendMessageToAI(message) {
    try {
      const pageContext = getCurrentPageContext();
      const isUnrestricted = true && !(/prelaunch|invite|waitlist/i.test(window.location.pathname) || document.body.classList.contains('prelaunch'));
      const isPrelaunch = /prelaunch|invite|waitlist/i.test(window.location.pathname) || document.body.classList.contains('prelaunch');
      
      const response = await fetch('/api/chat/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          conversationHistory: conversationHistory,
          currentPage: pageContext.page,
          formContext: pageContext.formContext,
          mode: isUnrestricted ? 'dana_unrestricted' : (isPrelaunch ? 'dana_prelaunch' : 'default')
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('AI request error:', error);
      throw error;
    }
  }

  // Handle user input
  async function handleUserInput() {
    const input = document.getElementById('chat_input');
    const sendButton = document.getElementById('chat_send');
    const message = input.value.trim();
    
    if (!message || isProcessing) return;
    
    // Set processing state
    isProcessing = true;
    input.disabled = true;
    sendButton.disabled = true;
    
    // Add user message to chat
    addMessage('You', message, 'user');
    
    // Add to conversation history
    conversationHistory.push({
      role: 'user',
      content: message
    });
    
    // Clear input
    input.value = '';
    
    // Show typing indicator
    showTypingIndicator(true);
    
    try {
      // Send to AI backend
      const response = await sendMessageToAI(message);
      
      // Hide typing indicator
      showTypingIndicator(false);
      
      // Add AI response to chat
      if (response.response) {
        addMessage('Dana', response.response, 'bot');
        
        // Speak the response if voice output is enabled
        speakText(response.response);
        
        // Add to conversation history
        conversationHistory.push({
          role: 'assistant',
          content: response.response
        });
        
        // Limit conversation history to last 20 messages (10 exchanges)
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }
      } else {
        throw new Error('No response from AI');
      }
      
    } catch (error) {
      showTypingIndicator(false);
      
      // Show error message
      const errorMessage = `I apologize, but I'm having trouble connecting right now. Please try again, or contact us directly at:\n\n• Phone: (305) 850-7848\n• Email: info@fedevent.com\n\nOur team is available to help!`;
      addMessage('Assistant', errorMessage, 'bot');
      
      console.error('Chat error:', error);
    } finally {
      // Reset processing state
      isProcessing = false;
      input.disabled = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  // Add quick action buttons
  function addQuickActions() {
    const messagesContainer = document.getElementById('chat-messages');
    const pageContext = getCurrentPageContext();
    
    // Only add quick actions on first load and if on form page
    if (messagesContainer.children.length <= 1 && pageContext.formContext.hasForm) {
      const quickActionsDiv = document.createElement('div');
      quickActionsDiv.className = 'chat-quick-actions';
      quickActionsDiv.innerHTML = `
        <div class="quick-actions-title">Quick questions:</div>
        <button class="quick-action-btn" data-question="How do I fill out this registration form?">📋 Help with form</button>
        <button class="quick-action-btn" data-question="What are the NET30 payment terms?">💰 Payment terms</button>
        <button class="quick-action-btn" data-question="What requirements do I need to meet?">✅ Requirements</button>
        <button class="quick-action-btn" data-question="How long does approval take?">⏰ Approval time</button>
      `;
      
      messagesContainer.appendChild(quickActionsDiv);
      
      // Add event listeners to quick action buttons
      quickActionsDiv.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const question = btn.getAttribute('data-question');
          document.getElementById('chat_input').value = question;
          handleUserInput();
          quickActionsDiv.remove(); // Remove quick actions after use
        });
      });
    }
  }

  // Initialize speech recognition
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser');
      return null;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      isListening = true;
      const voiceBtn = document.getElementById('chat_voice_input');
      voiceBtn.classList.add('listening');
      voiceBtn.title = 'Listening... Click to stop';
      
      // Add listening indicator to input
      const input = document.getElementById('chat_input');
      input.placeholder = '🎤 Listening...';
    };
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const input = document.getElementById('chat_input');
      input.value = transcript;
      
      // Auto-send the transcribed message
      setTimeout(() => {
        handleUserInput();
      }, 300);
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      stopListening();
      
      if (event.error === 'not-allowed') {
        addMessage('Assistant', '🎤 Microphone access was denied. Please allow microphone access in your browser settings to use voice input.', 'bot');
      } else if (event.error === 'no-speech') {
        // Silent error, user didn't speak
      } else {
        addMessage('Assistant', '🎤 Sorry, I couldn\'t hear that. Please try again.', 'bot');
      }
    };
    
    recognition.onend = () => {
      stopListening();
    };
    
    return recognition;
  }
  
  // Start listening for voice input
  function startListening() {
    if (!recognition) {
      recognition = initSpeechRecognition();
      if (!recognition) {
        addMessage('Assistant', '🎤 Voice input is not supported in your browser. Please try Chrome, Safari, or Edge.', 'bot');
        return;
      }
    }
    
    if (isListening) {
      recognition.stop();
      return;
    }
    
    try {
      recognition.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
    }
  }
  
  // Stop listening
  function stopListening() {
    isListening = false;
    const voiceBtn = document.getElementById('chat_voice_input');
    voiceBtn.classList.remove('listening');
    voiceBtn.title = 'Click to speak';
    
    const input = document.getElementById('chat_input');
    input.placeholder = 'Ask me anything about registration, policies, or how to fill out forms...';
  }
  
  // Speak text using text-to-speech
  function speakText(text) {
    if (!isVoiceOutputEnabled) return;
    
    // Stop any current speech
    if (synthesis.speaking) {
      synthesis.cancel();
    }
    
    // Remove markdown formatting for better speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold
      .replace(/\n/g, ' ')               // Replace newlines with spaces
      .replace(/•/g, '')                 // Remove bullets
      .replace(/\[.*?\]/g, '');          // Remove links
    
    currentUtterance = new SpeechSynthesisUtterance(cleanText);
    currentUtterance.rate = 1.0;
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;
    
    // Try to use a pleasant voice
    const voices = synthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && (voice.name.includes('Female') || voice.name.includes('Samantha'))
    ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
    
    if (preferredVoice) {
      currentUtterance.voice = preferredVoice;
    }
    
    currentUtterance.onstart = () => {
      const voiceOutputBtn = document.getElementById('chat_voice_output');
      voiceOutputBtn.classList.add('speaking');
    };
    
    currentUtterance.onend = () => {
      const voiceOutputBtn = document.getElementById('chat_voice_output');
      voiceOutputBtn.classList.remove('speaking');
    };
    
    synthesis.speak(currentUtterance);
  }
  
  // Toggle voice output
  function toggleVoiceOutput() {
    isVoiceOutputEnabled = !isVoiceOutputEnabled;
    const voiceOutputBtn = document.getElementById('chat_voice_output');
    
    if (isVoiceOutputEnabled) {
      voiceOutputBtn.classList.add('active');
      voiceOutputBtn.title = 'Voice responses enabled (click to disable)';
      
      // Announce activation
      const utterance = new SpeechSynthesisUtterance('Voice responses enabled');
      synthesis.speak(utterance);
    } else {
      voiceOutputBtn.classList.remove('active');
      voiceOutputBtn.title = 'Enable voice responses';
      
      // Stop any current speech
      if (synthesis.speaking) {
        synthesis.cancel();
      }
    }
    
    // Track voice output toggle
    if (typeof gtag !== 'undefined') {
      gtag('event', 'voice_output_toggled', {
        'event_category': 'User Interaction',
        'event_label': isVoiceOutputEnabled ? 'enabled' : 'disabled'
      });
    }
  }

  // Clear chat and reset to initial state
  function clearChat() {
    // Clear conversation history
    conversationHistory = [];
    
    // Clear messages container
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '';
    
    // Re-initialize with welcome message and quick actions
    initChat();
    setTimeout(() => addQuickActions(), 100);
    
    // Show success feedback
    const clearBtn = document.getElementById('chat-clear');
    const originalText = clearBtn.innerHTML;
    clearBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 4L6 11L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Cleared!';
    clearBtn.disabled = true;
    
    setTimeout(() => {
      clearBtn.innerHTML = originalText;
      clearBtn.disabled = false;
    }, 1500);
    
    // Track clear event
    if (typeof gtag !== 'undefined') {
      gtag('event', 'chat_cleared', {
        'event_category': 'User Interaction',
        'event_label': 'AI Assistant'
      });
    }
  }

  // Set up event listeners
  function setupEventListeners() {
    // Bubble click to open/close
    bubble.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        // Hide the entire DANA sphere when chat opens
        bubble.style.display = 'none';
      } else {
        // Show the entire DANA sphere when chat closes and restore DANA video
        bubble.style.display = 'grid';
        // Ensure DANA video is properly restored
        bubble.innerHTML = `
          <video id="danaVideo" src="/dana.mp4" alt="DANA" class="dana-video" playsinline></video>
          <div class="bubble-pulse"></div>
        `;
      }
    });

    // DANA video hover events
    bubble.addEventListener('mouseenter', playDanaVideo);
    bubble.addEventListener('mouseleave', pauseDanaVideo);

    // Panel open logic
    if (panel.classList.contains('open')) {
      if (document.getElementById('chat-messages').children.length === 0) {
        initChat();
        setTimeout(() => addQuickActions(), 100);
      }
      setTimeout(() => {
        document.getElementById('chat_input').focus();
      }, 300);
      
      // Track chat open event
      if (typeof gtag !== 'undefined') {
        gtag('event', 'chat_opened', {
          'event_category': 'User Interaction',
          'event_label': 'AI Assistant'
        });
      }
    }
    
    // Minimize button
    document.getElementById('chat-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.remove('open');
    });
    
    // Clear chat button
    document.getElementById('chat-clear').addEventListener('click', () => {
      clearChat();
    });
    
    // Voice input button
    document.getElementById('chat_voice_input').addEventListener('click', () => {
      startListening();
      
      // Track voice input usage
      if (typeof gtag !== 'undefined') {
        gtag('event', 'voice_input_used', {
          'event_category': 'User Interaction',
          'event_label': 'AI Assistant'
        });
      }
    });
    
    // Voice output toggle button
    document.getElementById('chat_voice_output').addEventListener('click', () => {
      toggleVoiceOutput();
    });
    
    // Send button
    document.getElementById('chat_send').addEventListener('click', handleUserInput);
    
    // Enter key to send
    document.getElementById('chat_input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
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

    // Detect form field focus to offer help
    document.addEventListener('focusin', (e) => {
      if (e.target.matches('input, select, textarea') && e.target.form) {
        const label = document.querySelector(`label[for="${e.target.id}"]`);
        const fieldName = label ? label.textContent.trim() : (e.target.name || e.target.id);
        
        // Show a subtle notification on the bubble
        if (fieldName && !panel.classList.contains('open')) {
          bubble.setAttribute('data-tooltip', `Need help with "${fieldName}"? Click me!`);
          bubble.classList.add('has-tooltip');
          
          setTimeout(() => {
            bubble.classList.remove('has-tooltip');
            bubble.removeAttribute('data-tooltip');
          }, 5000);
        }
      }
    });
  }

  // DANA Video Functions
  let danaActivated = false;

  function activateDanaOnPageInteraction() {
    if (!danaActivated) {
      // Trigger a silent video play to satisfy browser requirements
      const danaVideo = document.getElementById('danaVideo');
      if (danaVideo) {
        danaVideo.muted = true;
        danaVideo.play().then(() => {
          danaVideo.pause();
          danaVideo.muted = false;
          danaActivated = true;
          console.log('DANA activated - hover should work now');
        }).catch(e => console.log('DANA activation failed:', e));
      }
    }
  }

  function playDanaVideo() {
    const danaVideo = document.getElementById('danaVideo');
    if (danaVideo) {
      danaVideo.currentTime = 0;
      danaVideo.play().catch(e => console.log('Video play failed:', e));
    }
  }

  function pauseDanaVideo() {
    const danaVideo = document.getElementById('danaVideo');
    if (danaVideo) {
      danaVideo.pause();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(bubble);
      document.body.appendChild(panel);
      setupEventListeners();
      
      // Auto-activate DANA on any page interaction
      const activationEvents = ['click', 'touchstart', 'keydown', 'mousemove'];
      activationEvents.forEach(event => {
        document.addEventListener(event, activateDanaOnPageInteraction, { once: true });
      });
    });
  } else {
    document.body.appendChild(bubble);
    document.body.appendChild(panel);
    setupEventListeners();
    
    // Auto-activate DANA on any page interaction
    const activationEvents = ['click', 'touchstart', 'keydown', 'mousemove'];
    activationEvents.forEach(event => {
      document.addEventListener(event, activateDanaOnPageInteraction, { once: true });
    });
  }
})();
