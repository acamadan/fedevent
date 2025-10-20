/**
 * D.A.N.A Custom Agent System
 * Digital Assistant Network Agent - Intelligent Response Engine
 */

class DanaAgent {
    constructor() {
        this.knowledgeBase = this.initializeKnowledgeBase();
        this.conversationContext = [];
        this.userProfile = {};
        this.responseHistory = [];
        this.learningData = {};
    }

    /**
     * Initialize D.A.N.A's comprehensive knowledge base
     */
    initializeKnowledgeBase() {
        return {
            // FEDEVENT Core Information
            fedevent: {
                description: "FEDEVENT is a platform connecting hotels with government contract opportunities from US Government and United Nations",
                launchDate: "2026",
                benefits: [
                    "Zero direct billing paperwork",
                    "NET30 payment terms", 
                    "Access to high-value contracts",
                    "Pre-qualification for faster processing"
                ]
            },

            // Hotel Eligibility Requirements
            eligibility: {
                propertyRequirements: {
                    indoor: "Must be an indoor property (guests access rooms through indoor corridors)",
                    outdoor: "Outdoor corridor properties are not accepted"
                },
                paymentTerms: {
                    net30: "Must accept NET30 payment terms",
                    directBill: "No Direct Bill Application required"
                },
                bonusQualifications: {
                    discount: "Hotels accepting 30% off per diem rates get higher consideration",
                    prequalification: "Pre-qualification for faster contract processing"
                }
            },

            // Contract Types and Opportunities
            contracts: {
                usGovernment: {
                    types: [
                        "Lodging for government employees",
                        "Conference and training events", 
                        "Long-term accommodation agreements"
                    ],
                    benefits: "Zero direct billing paperwork, NET30 payment terms, Pre-qualified opportunities"
                },
                unitedNations: {
                    types: [
                        "Diplomatic lodging accommodations",
                        "UN conference and meeting facilities",
                        "International delegation housing"
                    ],
                    benefits: "International exposure, High-value contracts, Prestigious clientele"
                }
            },

            // Payment and Billing Information
            payment: {
                terms: "NET30 payment terms (payment within 30 days)",
                billing: "No direct billing paperwork required, We handle all government billing procedures",
                rates: {
                    standard: "Standard government per diem rates",
                    discount: "30% off per diem rates for premium consideration",
                    transparent: "Transparent pricing with no hidden fees"
                },
                benefits: [
                    "Faster payment processing",
                    "Reduced administrative burden", 
                    "Guaranteed payment from government agencies"
                ]
            },

            // Process and Timeline
            process: {
                immediate: [
                    "Confirmation email with unique reference number",
                    "Pre-qualification for government contracts",
                    "Priority access to new opportunities"
                ],
                ongoing: [
                    "Email notifications when relevant opportunities match your hotel",
                    "Simple online application process (no complex paperwork)",
                    "We handle all government billing and paperwork",
                    "Guaranteed NET30 payment terms"
                ],
                timeline: {
                    firstOpportunities: "First opportunities could arrive within weeks",
                    dependsOn: "Depends on government needs in your area",
                    faster: "Faster if you accept 30% off per diem rates"
                }
            },

            // Form Assistance
            formHelp: {
                steps: [
                    "Property Eligibility: Answer 'Yes' if your hotel has indoor corridors",
                    "Accept Terms: Check all required policy boxes",
                    "Hotel Info: Use Google Places autocomplete for accuracy",
                    "Contact Details: Provide your information as primary contact",
                    "Select Interests: Choose what types of contracts interest you"
                ],
                tips: [
                    "Use the Google Places autocomplete for accurate hotel data",
                    "Accept 30% off per diem rates for higher consideration",
                    "Double-check your email address for notifications"
                ]
            }
        };
    }

    /**
     * Process user message and generate intelligent response
     */
    async processMessage(userMessage, context = {}) {
        try {
            // Add to conversation context
            this.conversationContext.push({
                type: 'user',
                message: userMessage,
                timestamp: new Date(),
                context: context
            });

            // Analyze intent and extract entities
            const analysis = this.analyzeMessage(userMessage);
            
            // Generate response based on analysis
            const response = await this.generateIntelligentResponse(analysis, userMessage);
            
            // Add response to context
            this.conversationContext.push({
                type: 'assistant',
                message: response,
                timestamp: new Date(),
                analysis: analysis
            });

            // Learn from interaction
            this.learnFromInteraction(userMessage, response, analysis);

            return response;

        } catch (error) {
            console.error('D.A.N.A Agent Error:', error);
            return this.getFallbackResponse();
        }
    }

    /**
     * Analyze user message for intent and entities
     */
    analyzeMessage(message) {
        const lowerMessage = message.toLowerCase();
        
        return {
            intent: this.detectIntent(lowerMessage),
            entities: this.extractEntities(lowerMessage),
            sentiment: this.analyzeSentiment(lowerMessage),
            urgency: this.detectUrgency(lowerMessage),
            context: this.getContextualInfo(lowerMessage)
        };
    }

    /**
     * Detect user intent
     */
    detectIntent(message) {
        const intents = {
            eligibility: ['eligibility', 'qualify', 'requirement', 'indoor', 'outdoor', 'corridor'],
            contracts: ['contract', 'opportunity', 'available', 'government', 'un', 'united nations'],
            payment: ['payment', 'billing', 'money', 'cost', 'rate', 'price', 'net30'],
            process: ['after', 'join', 'next', 'happen', 'timeline', 'when', 'how long'],
            form: ['form', 'fill', 'submit', 'application', 'register', 'signup'],
            help: ['help', 'how', 'what', 'explain', 'tell me', 'information'],
            contact: ['contact', 'phone', 'email', 'reach', 'speak', 'talk'],
            complaint: ['problem', 'issue', 'wrong', 'error', 'bug', 'not working'],
            praise: ['good', 'great', 'excellent', 'amazing', 'love', 'perfect']
        };

        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(keyword => message.includes(keyword))) {
                return intent;
            }
        }

        return 'general';
    }

    /**
     * Extract entities from message
     */
    extractEntities(message) {
        const entities = {
            hotelType: this.extractHotelType(message),
            location: this.extractLocation(message),
            timeframe: this.extractTimeframe(message),
            specificQuestions: this.extractSpecificQuestions(message)
        };

        return entities;
    }

    /**
     * Generate intelligent response based on analysis
     */
    async generateIntelligentResponse(analysis, originalMessage) {
        const { intent, entities, sentiment, urgency } = analysis;
        
        // Get relevant knowledge
        const relevantKnowledge = this.getRelevantKnowledge(intent, entities);
        
        // Generate contextual response
        const response = this.buildResponse(intent, entities, relevantKnowledge, sentiment, urgency);
        
        // Add personalization
        const personalizedResponse = this.personalizeResponse(response, this.userProfile);
        
        return personalizedResponse;
    }

    /**
     * Get relevant knowledge based on intent and entities
     */
    getRelevantKnowledge(intent, entities) {
        const knowledge = this.knowledgeBase;
        
        switch (intent) {
            case 'eligibility':
                return {
                    ...knowledge.eligibility,
                    ...knowledge.fedevent
                };
            case 'contracts':
                return {
                    ...knowledge.contracts,
                    ...knowledge.fedevent
                };
            case 'payment':
                return {
                    ...knowledge.payment,
                    ...knowledge.fedevent
                };
            case 'process':
                return {
                    ...knowledge.process,
                    ...knowledge.fedevent
                };
            case 'form':
                return {
                    ...knowledge.formHelp,
                    ...knowledge.eligibility
                };
            default:
                return knowledge.fedevent;
        }
    }

    /**
     * Build response based on intent and knowledge
     */
    buildResponse(intent, entities, knowledge, sentiment, urgency) {
        const responseTemplates = {
            eligibility: this.buildEligibilityResponse(entities, knowledge),
            contracts: this.buildContractsResponse(entities, knowledge),
            payment: this.buildPaymentResponse(entities, knowledge),
            process: this.buildProcessResponse(entities, knowledge),
            form: this.buildFormResponse(entities, knowledge),
            help: this.buildHelpResponse(entities, knowledge),
            contact: this.buildContactResponse(entities, knowledge),
            complaint: this.buildComplaintResponse(entities, knowledge),
            praise: this.buildPraiseResponse(entities, knowledge),
            general: this.buildGeneralResponse(entities, knowledge)
        };

        return responseTemplates[intent] || responseTemplates.general;
    }

    /**
     * Build eligibility response
     */
    buildEligibilityResponse(entities, knowledge) {
        return `Hotel eligibility requirements for FEDEVENT:<br><br>
        <strong>🏨 Property Requirements:</strong><br>
        • ${knowledge.propertyRequirements.indoor}<br>
        • ${knowledge.propertyRequirements.outdoor}<br><br>
        <strong>💳 Payment Terms:</strong><br>
        • ${knowledge.paymentTerms.net30}<br>
        • ${knowledge.paymentTerms.directBill}<br><br>
        <strong>🏆 Bonus Qualifications:</strong><br>
        • ${knowledge.bonusQualifications.discount}<br>
        • ${knowledge.bonusQualifications.prequalification}<br><br>
        <strong>❓ Not sure if you qualify?</strong> Fill out the form below and we'll assess your eligibility!`;
    }

    /**
     * Build contracts response
     */
    buildContractsResponse(entities, knowledge) {
        return `FEDEVENT connects hotels with government contract opportunities:<br><br>
        <strong>🏛️ US Government Contracts:</strong><br>
        ${knowledge.contracts.usGovernment.types.map(type => `• ${type}`).join('<br>')}<br><br>
        <strong>🌍 United Nations Contracts:</strong><br>
        ${knowledge.contracts.unitedNations.types.map(type => `• ${type}`).join('<br>')}<br><br>
        <strong>✨ Key Benefits:</strong><br>
        • <strong>Zero direct billing paperwork</strong><br>
        • <strong>NET30 payment terms</strong><br>
        • <strong>Pre-qualified opportunities</strong><br><br>
        Ready to join? Scroll down to fill out the waitlist form!`;
    }

    /**
     * Build payment response
     */
    buildPaymentResponse(entities, knowledge) {
        return `Payment process is streamlined for government contracts:<br><br>
        <strong>💳 Payment Terms:</strong><br>
        • <strong>${knowledge.payment.terms}</strong><br>
        • ${knowledge.payment.billing}<br><br>
        <strong>💰 Rate Structure:</strong><br>
        • ${knowledge.payment.rates.standard}<br>
        • <strong>${knowledge.payment.rates.discount}</strong><br>
        • ${knowledge.payment.rates.transparent}<br><br>
        <strong>⚡ Benefits:</strong><br>
        ${knowledge.payment.benefits.map(benefit => `• ${benefit}`).join('<br>')}<br><br>
        <strong>💡 Tip:</strong> Accepting 30% off per diem rates gives you higher priority for contracts!`;
    }

    /**
     * Build process response
     */
    buildProcessResponse(entities, knowledge) {
        return `What happens after joining the FEDEVENT waitlist:<br><br>
        <strong>🚀 Immediate Benefits:</strong><br>
        ${knowledge.process.immediate.map(benefit => `• <strong>${benefit}</strong>`).join('<br>')}<br><br>
        <strong>📧 Ongoing Process:</strong><br>
        ${knowledge.process.ongoing.map(step => `• ${step}`).join('<br>')}<br><br>
        <strong>⏱️ Timeline:</strong><br>
        • ${knowledge.process.timeline.firstOpportunities}<br>
        • ${knowledge.process.timeline.dependsOn}<br>
        • ${knowledge.process.timeline.faster}<br><br>
        <strong>🎯 Ready to get started?</strong> Fill out the form below!`;
    }

    /**
     * Build form response
     */
    buildFormResponse(entities, knowledge) {
        return `Here's how to fill out the FEDEVENT waitlist form:<br><br>
        <strong>📋 Step-by-Step Guide:</strong><br>
        ${knowledge.formHelp.steps.map((step, index) => `${index + 1}. <strong>${step}</strong>`).join('<br>')}<br><br>
        <strong>💡 Pro Tips:</strong><br>
        ${knowledge.formHelp.tips.map(tip => `• ${tip}`).join('<br>')}<br><br>
        <strong>❓ Need help with a specific field?</strong> Just ask me!`;
    }

    /**
     * Build help response
     */
    buildHelpResponse(entities, knowledge) {
        return `I'm D.A.N.A, your FEDEVENT prelaunch assistant! Here's what I can help with:<br><br>
        <strong>📋 Common Questions:</strong><br>
        • Hotel eligibility requirements<br>
        • Government contract opportunities<br>
        • Payment and billing processes<br>
        • How to fill out the waitlist form<br>
        • What happens after joining<br><br>
        <strong>🎯 Quick Actions:</strong><br>
        • Use the quick questions above for instant answers<br>
        • Ask me about specific form fields<br>
        • Get clarification on requirements<br><br>
        <strong>🚀 Ready to Join?</strong><br>
        Scroll down to fill out the waitlist form and start your government contracting journey!<br><br>
        <strong>💬 Need more help?</strong> Just ask me anything specific!`;
    }

    /**
     * Build contact response
     */
    buildContactResponse(entities, knowledge) {
        return `I'm here to help! You can reach me through this chat interface anytime.<br><br>
        <strong>💬 How I can assist:</strong><br>
        • Answer questions about FEDEVENT<br>
        • Help with the waitlist form<br>
        • Explain eligibility requirements<br>
        • Guide you through the process<br><br>
        <strong>🎯 For immediate assistance:</strong><br>
        • Ask me specific questions about your hotel<br>
        • Get personalized guidance based on your situation<br>
        • Receive step-by-step instructions<br><br>
        What would you like to know about FEDEVENT?`;
    }

    /**
     * Build complaint response
     */
    buildComplaintResponse(entities, knowledge) {
        return `I'm sorry to hear you're experiencing issues! Let me help resolve this.<br><br>
        <strong>🔧 Common Solutions:</strong><br>
        • Try refreshing the page if the form isn't working<br>
        • Make sure all required fields are filled out<br>
        • Check that you've accepted the terms and conditions<br>
        • Ensure your hotel meets the indoor corridor requirement<br><br>
        <strong>💡 Still having trouble?</strong><br>
        • Describe the specific issue you're facing<br>
        • I can provide step-by-step troubleshooting<br>
        • We'll get you registered successfully!<br><br>
        What specific problem are you encountering?`;
    }

    /**
     * Build praise response
     */
    buildPraiseResponse(entities, knowledge) {
        return `Thank you so much! I'm thrilled to hear that FEDEVENT is helpful for you! 😊<br><br>
        <strong>🌟 Your feedback means everything to us!</strong><br>
        • We're building something special for the hospitality industry<br>
        • Your support helps us improve the platform<br>
        • We can't wait to connect you with amazing opportunities<br><br>
        <strong>🚀 Ready to take the next step?</strong><br>
        • Fill out the waitlist form to get started<br>
        • You'll be among the first to access opportunities<br>
        • We'll keep you updated on your application status<br><br>
        Thank you for being part of the FEDEVENT community!`;
    }

    /**
     * Build general response
     */
    buildGeneralResponse(entities, knowledge) {
        return `That's a great question! FEDEVENT is a platform that connects hotels with government contract opportunities from the US Government and United Nations.<br><br>
        <strong>Key benefits include:</strong><br>
        ${knowledge.fedevent.benefits.map(benefit => `• ${benefit}`).join('<br>')}<br><br>
        <strong>🎯 To get started:</strong><br>
        1. Check if your hotel qualifies (indoor property + NET30 terms)<br>
        2. Fill out the waitlist form below<br>
        3. Start receiving exclusive opportunities<br><br>
        Would you like to know more about eligibility requirements, contract types, or how to fill out the form?`;
    }

    /**
     * Personalize response based on user profile
     */
    personalizeResponse(response, userProfile) {
        // Add personalization logic here
        // For now, return the response as-is
        return response;
    }

    /**
     * Learn from user interactions
     */
    learnFromInteraction(userMessage, response, analysis) {
        // Store interaction data for learning
        this.learningData[Date.now()] = {
            userMessage,
            response,
            analysis,
            success: true // Could be determined by user feedback
        };
    }

    /**
     * Get fallback response for errors
     */
    getFallbackResponse() {
        return `I apologize, but I'm experiencing a technical issue. Please try asking your question again, or feel free to scroll down and fill out the waitlist form directly.<br><br>
        <strong>💡 In the meantime:</strong><br>
        • Check if your hotel has indoor corridors<br>
        • Ensure you can accept NET30 payment terms<br>
        • Use the Google Places autocomplete for accurate hotel data<br><br>
        I'm here to help once I'm back online!`;
    }

    // Helper methods for entity extraction
    extractHotelType(message) {
        if (message.includes('indoor') || message.includes('corridor')) return 'indoor';
        if (message.includes('outdoor')) return 'outdoor';
        return null;
    }

    extractLocation(message) {
        // Simple location extraction - could be enhanced
        const locationKeywords = ['city', 'state', 'country', 'address', 'location'];
        return locationKeywords.some(keyword => message.includes(keyword));
    }

    extractTimeframe(message) {
        const timeKeywords = ['when', 'how long', 'timeline', 'soon', 'immediately', 'weeks', 'months'];
        return timeKeywords.some(keyword => message.includes(keyword));
    }

    extractSpecificQuestions(message) {
        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who'];
        return questionWords.some(word => message.includes(word));
    }

    analyzeSentiment(message) {
        const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'perfect', 'wonderful'];
        const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'problem', 'issue', 'wrong'];
        
        const positiveCount = positiveWords.filter(word => message.includes(word)).length;
        const negativeCount = negativeWords.filter(word => message.includes(word)).length;
        
        if (positiveCount > negativeCount) return 'positive';
        if (negativeCount > positiveCount) return 'negative';
        return 'neutral';
    }

    detectUrgency(message) {
        const urgentWords = ['urgent', 'asap', 'immediately', 'quickly', 'emergency', 'critical'];
        return urgentWords.some(word => message.includes(word));
    }

    getContextualInfo(message) {
        return {
            hasQuestion: message.includes('?'),
            hasGreeting: ['hello', 'hi', 'hey', 'good morning', 'good afternoon'].some(word => message.includes(word)),
            isComplaint: ['problem', 'issue', 'wrong', 'error', 'bug'].some(word => message.includes(word)),
            isPraise: ['good', 'great', 'excellent', 'amazing', 'love'].some(word => message.includes(word))
        };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DanaAgent;
} else {
    window.DanaAgent = DanaAgent;
}
