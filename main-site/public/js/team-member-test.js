// Team Member Functionality Test
describe('Team Member Functionality', function() {
    beforeEach(function() {
        // Set up DOM elements for testing
        document.body.innerHTML = `
            <button id="addTeamMemberBtn">Add Team Member</button>
            <div id="teamMembersContainer"></div>
            
            <template id="team-member-template">
                <div class="team-member">
                    <button class="remove-team-member">Remove</button>
                    <input class="team-member-name" />
                    <input class="team-member-title" />
                    <input class="team-member-email" />
                    <input class="team-member-phone" />
                </div>
            </template>
        `;
    });

    it('should add a team member when the add button is clicked', function() {
        // Initialize the team member functionality
        const addTeamMemberBtn = document.getElementById('addTeamMemberBtn');
        const teamMembersContainer = document.getElementById('teamMembersContainer');
        const teamMemberTemplate = document.getElementById('team-member-template');
        
        // Add team member functionality
        addTeamMemberBtn.addEventListener('click', function() {
            const templateContent = teamMemberTemplate.content.cloneNode(true);
            teamMembersContainer.appendChild(templateContent);
        });
        
        // Click the add button
        addTeamMemberBtn.click();
        
        // Check that a team member was added
        const teamMembers = teamMembersContainer.querySelectorAll('.team-member');
        expect(teamMembers.length).toBe(1);
    });

    it('should remove a team member when the remove button is clicked', function() {
        // Initialize the team member functionality
        const addTeamMemberBtn = document.getElementById('addTeamMemberBtn');
        const teamMembersContainer = document.getElementById('teamMembersContainer');
        const teamMemberTemplate = document.getElementById('team-member-template');
        
        // Add team member functionality
        addTeamMemberBtn.addEventListener('click', function() {
            const templateContent = teamMemberTemplate.content.cloneNode(true);
            teamMembersContainer.appendChild(templateContent);
        });
        
        // Event delegation for remove buttons
        teamMembersContainer.addEventListener('click', function(e) {
            if (e.target && e.target.classList.contains('remove-team-member')) {
                e.target.closest('.team-member').remove();
            }
        });
        
        // Add a team member
        addTeamMemberBtn.click();
        
        // Click the remove button
        const removeBtn = teamMembersContainer.querySelector('.remove-team-member');
        removeBtn.click();
        
        // Check that the team member was removed
        const teamMembers = teamMembersContainer.querySelectorAll('.team-member');
        expect(teamMembers.length).toBe(0);
    });

    it('should collect team member data correctly', function() {
        // Initialize the team member functionality
        const addTeamMemberBtn = document.getElementById('addTeamMemberBtn');
        const teamMembersContainer = document.getElementById('teamMembersContainer');
        const teamMemberTemplate = document.getElementById('team-member-template');
        
        // Add team member functionality
        addTeamMemberBtn.addEventListener('click', function() {
            const templateContent = teamMemberTemplate.content.cloneNode(true);
            teamMembersContainer.appendChild(templateContent);
        });
        
        // Add a team member
        addTeamMemberBtn.click();
        
        // Fill in the team member data
        const nameInput = teamMembersContainer.querySelector('.team-member-name');
        const titleInput = teamMembersContainer.querySelector('.team-member-title');
        const emailInput = teamMembersContainer.querySelector('.team-member-email');
        const phoneInput = teamMembersContainer.querySelector('.team-member-phone');
        
        nameInput.value = 'John Doe';
        titleInput.value = 'Sales Manager';
        emailInput.value = 'john@example.com';
        phoneInput.value = '123-456-7890';
        
        // Collect team member data
        const teamMembers = [];
        const teamMemberElements = teamMembersContainer.querySelectorAll('.team-member');
        teamMemberElements.forEach((member) => {
            const name = member.querySelector('.team-member-name').value;
            const title = member.querySelector('.team-member-title').value;
            const email = member.querySelector('.team-member-email').value;
            const phone = member.querySelector('.team-member-phone').value;
            
            teamMembers.push({ name, title, email, phone });
        });
        
        // Check that the data was collected correctly
        expect(teamMembers.length).toBe(1);
        expect(teamMembers[0].name).toBe('John Doe');
        expect(teamMembers[0].title).toBe('Sales Manager');
        expect(teamMembers[0].email).toBe('john@example.com');
        expect(teamMembers[0].phone).toBe('123-456-7890');
    });
});