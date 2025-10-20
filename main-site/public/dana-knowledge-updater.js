/**
 * D.A.N.A Knowledge Updater
 * Simple interface to update D.A.N.A's knowledge base with ChatGPT-learned information
 */

class DanaKnowledgeUpdater {
    constructor(danaAgent) {
        this.danaAgent = danaAgent;
    }

    /**
     * Update D.A.N.A's knowledge base with information from ChatGPT
     * Call this method when you have new information from ChatGPT
     */
    updateKnowledgeBase(chatgptInfo) {
        console.log('🤖 Updating D.A.N.A with ChatGPT-learned information...');
        
        try {
            // Update FEDEVENT core information
            if (chatgptInfo.fedevent) {
                this.danaAgent.knowledgeBase.fedevent = {
                    ...this.danaAgent.knowledgeBase.fedevent,
                    ...chatgptInfo.fedevent
                };
                console.log('✅ Updated FEDEVENT core information');
            }

            // Update eligibility requirements
            if (chatgptInfo.eligibility) {
                this.danaAgent.knowledgeBase.eligibility = {
                    ...this.danaAgent.knowledgeBase.eligibility,
                    ...chatgptInfo.eligibility
                };
                console.log('✅ Updated eligibility requirements');
            }

            // Update contract information
            if (chatgptInfo.contracts) {
                this.danaAgent.knowledgeBase.contracts = {
                    ...this.danaAgent.knowledgeBase.contracts,
                    ...chatgptInfo.contracts
                };
                console.log('✅ Updated contract information');
            }

            // Update payment information
            if (chatgptInfo.payment) {
                this.danaAgent.knowledgeBase.payment = {
                    ...this.danaAgent.knowledgeBase.payment,
                    ...chatgptInfo.payment
                };
                console.log('✅ Updated payment information');
            }

            // Update process information
            if (chatgptInfo.process) {
                this.danaAgent.knowledgeBase.process = {
                    ...this.danaAgent.knowledgeBase.process,
                    ...chatgptInfo.process
                };
                console.log('✅ Updated process information');
            }

            // Add new sections if provided
            if (chatgptInfo.faq) {
                this.danaAgent.knowledgeBase.faq = chatgptInfo.faq;
                console.log('✅ Added FAQ section');
            }

            if (chatgptInfo.troubleshooting) {
                this.danaAgent.knowledgeBase.troubleshooting = chatgptInfo.troubleshooting;
                console.log('✅ Added troubleshooting section');
            }

            console.log('🎉 D.A.N.A knowledge base successfully updated!');
            return true;

        } catch (error) {
            console.error('❌ Error updating D.A.N.A knowledge base:', error);
            return false;
        }
    }

    /**
     * Simple method to add specific information
     * Use this for quick updates
     */
    addInformation(section, information) {
        if (!this.danaAgent.knowledgeBase[section]) {
            this.danaAgent.knowledgeBase[section] = {};
        }
        
        this.danaAgent.knowledgeBase[section] = {
            ...this.danaAgent.knowledgeBase[section],
            ...information
        };
        
        console.log(`✅ Added information to ${section} section`);
    }

    /**
     * Get current knowledge base for review
     */
    getCurrentKnowledge() {
        return this.danaAgent.knowledgeBase;
    }
}

// Make it available globally
if (typeof window !== 'undefined') {
    window.DanaKnowledgeUpdater = DanaKnowledgeUpdater;
}
