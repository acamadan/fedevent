# FEDEVENT Hotel User Guide

## Overview
FEDEVENT is a comprehensive platform for hotels and venues to connect with U.S. Government agencies for event bookings and government contracts. This guide covers all functions available to hotel users.

## Getting Started

### 1. Hotel Registration
**Location**: `/hotel-registration.html`

**Purpose**: Register your hotel with the FEDEVENT platform

**Multi-Step Registration Process**:

#### Step 1: Property Identity
**Required Fields**:
- **Hotel Name** (required): Official hotel name
- **Chain**: Select from dropdown (Hilton Worldwide, Marriott International, IHG, Hyatt, Wyndham, Choice, Accor, Other)
- **Brand**: Select from dropdown or enter custom brand
- **Hotel Property Code**: Internal property identifier
- **Hotel Address** (required): Street address with autocomplete
- **City** (required): City name
- **State/Province**: State or province
- **Postal Code**: ZIP or postal code
- **Country** (required): Country selection
- **Hotel Phone** (required): Primary contact number
- **Year Built**: Construction year (1900-2100)
- **Last Renovation**: Most recent renovation year
- **Website**: Hotel website URL

#### Step 2: Management/Franchise Company Information
**Fields**:
- **Is the hotel managed by a management company?**: Yes/No selection
- **Management Company Name**: If applicable
- **Management Company Address**: Full address with autocomplete
- **Management Company City/State/ZIP/Country**: Complete address details
- **Management Company Website**: Company website

#### Step 3: Primary Contact
**Required Fields**:
- **Name** (required): Primary contact person
- **Title** (required): Job title/position
- **Email** (required): Contact email address
- **Phone** (required): Direct phone number
- **Mobile**: Mobile phone number
- **Preferred Contact Method**: Email/Phone selection

#### Step 4: AAA Rating
**Fields**:
- **Are you an AAA rated hotel?** (required): Yes/No selection
- **AAA Rating Level**: If yes, select rating (2-5 diamonds)

#### Step 5: Bank Account Information
**Optional Section**: This section can be skipped if you prefer not to provide banking information at this time.

**If You Choose to Fill Banking Information**:
- **Hotel Location** (required if filling): US/International selection
- **US Hotels**: Bank name, routing number, account number, account type
- **International Hotels**: Bank name, SWIFT code, IBAN, account number

**Skip Option**: You can skip this section entirely and proceed to the next step without providing banking information.

#### Step 6: Sleeping Room Information
**Room Inventory**:
- **Total Guest Rooms** (required): Total room count
- **Single Occupancy Rooms**: King rooms count
- **Double Occupancy Rooms**: Double/queen rooms count
- **Suite Information**: Suite availability and types
- **Extended Stay**: Extended stay capabilities
- **Extended Stay Amenities**: Kitchen, washer/dryer, etc.

#### Step 7: Lodging Taxes
**Tax Information**:
- **Tax Breakdown Method** (required): How taxes are calculated
- **Tax Rate**: Percentage rates for different tax types
- **Tax Exemption**: Government tax exemption capabilities

#### Step 8: Meeting Spaces
**Meeting Facilities**:
- **Meeting Space Available?** (required): Yes/No selection
- **Meeting Room Details**: Room names, capacities, configurations
- **Seating Arrangements**: Theater, classroom, banquet, etc.
- **AV Equipment**: Available audio/visual equipment
- **Catering**: On-site catering capabilities

#### Step 9: A/V Services
**Audio/Visual Capabilities**:
- **In-house A/V Services?** (required): Yes/No selection
- **A/V Equipment Types**: Projectors, sound systems, lighting
- **Technical Support**: On-site technical assistance
- **Recording/Streaming**: Live streaming capabilities

#### Step 10: Seasonal Patterns
**Seasonal Information**:
- **Peak Season**: Select peak months
- **Shoulder Season**: Select shoulder months
- **Low Season**: Select low season months
- **Blockout Dates**: Unavailable dates for government events
- **Citywide Events**: Major events affecting availability
- **Cancelled Space**: Previously cancelled event space

#### Step 11: Hotel Amenities
**Comprehensive Amenity Selection**:
- **Property Amenities**: Pool, fitness center, business center, etc.
- **Room Amenities**: WiFi, coffee makers, mini-fridges, etc.
- **Dining Options**: Restaurants, bars, room service
- **Transportation**: Airport shuttle, parking, valet
- **Recreation**: Golf, spa, recreational facilities
- **Business Services**: Meeting rooms, conference facilities
- **Accessibility**: ADA compliance, accessible features

#### Step 12: Group Block & Policies
**Group Booking Policies**:
- **Max Group Block** (required): Maximum rooms for group bookings
- **Cutoff Days** (required): Advance booking requirements
- **Cancellation Policy**: Cancellation terms and conditions
- **Deposit Requirements**: Deposit amounts and timing
- **Group Rates**: Special pricing for government groups

#### Step 13: Concessions
**Concession Offerings**:
- **Complimentary Services**: Free WiFi, breakfast, parking
- **Upgrade Policies**: Room upgrade availability
- **Group Benefits**: Special group amenities
- **Government Rates**: Special government pricing

### 2. Hotel Login
**Location**: `/hotel-login.html`

**Features**:
- Secure authentication
- Session management
- Password reset functionality
- Multi-factor authentication support

### 3. Hotel Dashboard
**Location**: `/hotel-dashboard.html`

**Main Features**:
- **Hotel Profile Management**: Complete and update hotel information
- **Team Members**: Manage hotel team and access permissions
- **Contracts**: View and manage government contracts
- **Bidding Opportunities**: Browse and submit bids for government events
- **Documents & Agreements**: Access partnership agreements and legal forms
- **Support & Resources**: Get help and access training materials

## Core Functions

### 1. Hotel Profile Management
**Location**: `/hotel-profile.html`

**Profile Sections**:
- **Basic Information**:
  - Hotel name and branding
  - Property address and location
  - Contact information
  - Website and social media

- **Room Inventory**:
  - Total room count
  - Room types and configurations
  - Suite availability
  - Extended stay capabilities

- **Meeting Spaces**:
  - Meeting room inventory
  - Capacity and seating arrangements
  - AV equipment available
  - Catering capabilities

- **Amenities & Services**:
  - Hotel amenities
  - Business services
  - Recreational facilities
  - Transportation options

- **Government Compliance**:
  - Contracting experience
  - Security clearances
  - Payment terms acceptance
  - Certifications and credentials

#### Hotel Profile Form - Step-by-Step Instructions

**Event Request Form Fields** (When government clients request events):
- **Number of Attendees** (Required): Enter the total number of attendees
- Format: Enter as whole number (e.g., 50, 100, 200)
- This helps determine room and meeting space requirements
- Include all participants, not just overnight guests

- **Setup Type** (Required): Select the primary meeting setup
- Options: "Theater Style", "Classroom Style", "Banquet Style", "U-Shape", "Boardroom Style"
- This determines how meeting rooms will be configured
- Choose the setup that best fits the event type

- **Features** (Required): Select additional features needed
- Options: "AV Equipment", "Catering", "WiFi", "Parking", "Transportation"
- Select all features that apply to the event
- This helps determine pricing and availability

**Profile Update Process**:
1. Navigate to your hotel profile page
2. Review current information for accuracy
3. Update any changed information
4. Add new amenities or services
5. Update pricing and availability
6. Save changes to update your profile

### 2. Team Member Management
**Location**: Hotel Dashboard → Team Members

**Functions**:
- **Add Team Members**:
  - Email invitation system
  - Role assignment (Admin, Manager, Staff)
  - Permission levels
  - Contact information

- **Manage Existing Members**:
  - Edit roles and permissions
  - Update contact information
  - Deactivate/reactivate accounts
  - Remove team members

- **Access Control**:
  - Dashboard access levels
  - Contract viewing permissions
  - Bidding capabilities
  - Administrative functions

### 3. Contract Management
**Location**: `/hotel-contracts.html`

**Contract Features**:
- **Active Contracts**:
  - View current government contracts
  - Contract details and terms
  - Performance requirements
  - Payment schedules

- **Contract History**:
  - Completed contracts
  - Performance ratings
  - Payment records
  - Renewal opportunities

- **Contract Documents**:
  - Download contract files
  - View amendments
  - Access performance reports
  - Submit required documentation

### 4. Bidding Opportunities
**Location**: `/hotel-bidding.html`

**Bidding Process**:
- **Browse Opportunities**:
  - Search by location and dates
  - Filter by event type
  - View requirements and specifications
  - Check eligibility criteria

- **Submit Bids**:
  - Complete bid forms
  - Upload supporting documents
  - Set pricing and terms
  - Submit competitive proposals

- **Bid Management**:
  - Track bid status
  - View bid history
  - Receive notifications
  - Update bid information

#### Hotel Bidding Form - Step-by-Step Instructions

**Bid Form Fields** (Required for each bid):
- **Contracted Rate** (Required): Enter your contracted government rate
- Format: Enter as decimal number (e.g., 125.00 for $125.00)
- This is your standard government rate
- Must be competitive with market rates

- **Self-Pay Rate** (Required): Enter your self-pay rate for government employees
- Format: Enter as decimal number (e.g., 150.00 for $150.00)
- This is the rate for government employees paying out of pocket
- Usually higher than contracted rate

- **Auto-Bid Active** (Optional): Check if you want automatic bidding
- Select "Yes" to enable automatic bidding features
- Select "No" to manually manage all bids
- Auto-bidding can help you stay competitive

- **Auto-Bid Floor** (Required if auto-bid active): Enter your minimum bid amount
- Format: Enter as decimal number (e.g., 100.00 for $100.00)
- This is the lowest rate you're willing to accept
- Auto-bidding will not go below this amount

- **Auto-Bid Step** (Required if auto-bid active): Enter your bidding increment
- Format: Enter as decimal number (e.g., 5.00 for $5.00)
- This is how much your bid increases when outbid
- Common increments: $5.00, $10.00, $25.00

- **Additional Notes** (Optional): Enter any special information
- Include context about your hotel
- Mention any concessions or special offers
- Note any blackout dates or restrictions
- Examples: "Free breakfast included", "Flexible cancellation", "Near airport"

**Bid Submission Process**:
1. Review the opportunity details carefully
2. Fill in all required bid form fields
3. Add any additional notes or concessions
4. Review your bid before submitting
5. Click "Submit Bid" to submit your proposal
6. You'll receive confirmation of your bid submission

### 5. Partnership Agreement
**Location**: `/hotelagreemnt.html`

**Agreement Process**:
- **Review Terms**:
  - Partnership agreement details
  - Payment terms and conditions
  - Performance requirements
  - Legal obligations

- **Digital Signature**:
  - Electronic signature capability
  - Legal document generation
  - Agreement storage
  - Compliance tracking

### 6. Hotel Search Integration
**Location**: Government search results

**Features**:
- **Profile Visibility**:
  - Hotel appears in government searches
  - Detailed property information
  - Availability and pricing
  - Special capabilities

- **Lead Management**:
  - Receive government inquiries
  - Respond to requests
  - Track lead status
  - Convert to bookings

## Advanced Features

### 1. Hotel Registration Multi-Step Process
**Location**: `/hotel-registration.html`

**Step-by-Step Process**:
1. **Basic Information**: Hotel name, address, contact details
2. **Property Details**: Room types, meeting spaces, amenities
3. **Government Compliance**: Certifications, contracting experience
4. **Team Setup**: Add team members and set permissions
5. **Verification**: Review and submit for approval

### 2. Dynamic Form Features
- **Auto-save**: Forms save progress automatically
- **Validation**: Real-time field validation
- **Progress Tracking**: Visual progress indicators
- **Conditional Fields**: Show/hide fields based on selections

### 3. Google Places Integration
- **Address Autocomplete**: Automatic address suggestions
- **Location Verification**: Confirm hotel location
- **Map Integration**: Visual location confirmation
- **Distance Calculations**: Proximity to government facilities

### 4. Document Management
- **File Uploads**: Support for PDF, Word, images
- **Document Storage**: Secure document repository
- **Version Control**: Track document changes
- **Digital Signatures**: Electronic signature capability

## Dashboard Analytics

### 1. Performance Metrics
- **Active Contracts**: Number of current government contracts
- **Open Opportunities**: Available bidding opportunities
- **Team Size**: Number of active team members
- **Profile Status**: Completion percentage

### 2. Business Intelligence
- **Booking Trends**: Historical booking data
- **Revenue Tracking**: Government contract revenue
- **Performance Ratings**: Government feedback scores
- **Market Analysis**: Competitive positioning

### 3. Reporting Features
- **Custom Reports**: Generate business reports
- **Export Data**: Download data in various formats
- **Scheduled Reports**: Automated report delivery
- **Analytics Dashboard**: Visual data representation

## User Account Management

### 1. Login and Security
- **Secure Authentication**: Government-grade security
- **Session Management**: Automatic timeout protection
- **Password Requirements**: Strong password enforcement
- **Multi-factor Authentication**: Optional 2FA support

### 2. Profile Management
- **Personal Information**: Update contact details
- **Hotel Information**: Modify property details
- **Preferences**: Set notification and communication preferences
- **Security Settings**: Manage passwords and access

### 3. Team Administration
- **User Roles**: Admin, Manager, Staff levels
- **Permission Management**: Granular access control
- **Activity Monitoring**: Track user actions
- **Audit Logs**: Security and compliance tracking

## Support and Resources

### 1. Help Center
**Location**: `/help-center.html`

**Resources**:
- **FAQ Section**: Common questions and answers
- **Video Tutorials**: Step-by-step guides
- **Documentation**: Detailed user manuals
- **Best Practices**: Industry guidelines

### 2. Support Ticket System
**Location**: `/support-ticket.html`

**Features**:
- **Submit Issues**: Technical and account problems
- **Track Status**: Monitor resolution progress
- **Priority Support**: Government contract priority
- **Direct Communication**: Chat with support team

### 3. Training Resources
- **Onboarding Guide**: New user orientation
- **Video Training**: Platform walkthroughs
- **Webinars**: Live training sessions
- **Certification**: Government contracting certification

## Form Filling Assistance for DANA

### Hotel Registration Form Field Guidance

#### Property Identity Section - Step-by-Step Instructions

**Hotel Name** (Required):
- Enter the EXACT legal name as it appears on business licenses and tax documents
- Do NOT use abbreviations unless that's the official name
- Examples: "Hampton Inn & Suites by Hilton Downtown" not "Hampton Inn Downtown"
- If part of a chain, include the full brand name

**Chain Selection** (Required):
- Choose from dropdown: Hilton Worldwide, Marriott International, IHG, Hyatt, Wyndham, Choice, Accor, Other
- If your hotel is NOT part of a major chain, select "Other"
- If you select "Other", a text field will appear - enter your chain name there

**Brand Selection** (Required):
- Select the specific brand within your chain
- Examples: "Hampton Inn & Suites", "Courtyard by Marriott", "Holiday Inn Express"
- If your brand isn't listed, select "Other" and enter the brand name

**Hotel Property Code** (Optional):
- This is an internal code used by your hotel chain
- Usually found on your property's internal documents
- Format is typically letters/numbers (e.g., "HIL123", "MAR456")
- If you don't know this, you can leave it blank

**Hotel Address** (Required):
- Start typing your street address - autocomplete will suggest matches
- Click on the correct suggestion when it appears
- If autocomplete doesn't work, type the full address manually
- Include street number, street name, and any suite/unit number

**City** (Required):
- Enter the city where your hotel is located
- Use the official city name (not nicknames)
- Examples: "New York" not "NYC", "Los Angeles" not "LA"

**State/Province** (Optional for US):
- For US hotels: Enter the 2-letter state code (NY, CA, TX, etc.)
- For international hotels: Enter province/region name
- Examples: "CA" for California, "ON" for Ontario

**Postal Code** (Optional):
- Enter ZIP code (US) or postal code (international)
- US format: 12345 or 12345-6789
- International: Use your country's postal code format

**Country** (Required):
- Select from the dropdown list
- Choose the country where your hotel is physically located
- This determines tax and banking requirements

**Hotel Phone** (Required):
- Enter the main hotel phone number
- Include country code for international hotels
- US format: (555) 123-4567
- International: +1-555-123-4567
- This should be the number guests call for reservations

**Year Built** (Optional):
- Enter the 4-digit year the hotel was originally constructed
- NOT the year of renovation
- Examples: 1995, 2010, 2020
- If you don't know, leave blank

**Last Renovation** (Optional):
- Enter the 4-digit year of the most recent major renovation
- This includes major updates to rooms, lobby, or facilities
- Examples: 2018, 2022
- If no major renovations, leave blank

**Website** (Optional):
- Enter your hotel's website URL
- Include "https://" at the beginning
- Examples: "https://www.hamptoninn.com", "https://www.yourhotel.com"
- This helps government clients learn about your property

#### Management Company Section - Step-by-Step Instructions

**Is the hotel managed by a management company?** (Required):
- Select "Yes" if a third-party company manages your hotel operations
- Select "No" if your hotel is self-managed or owner-operated
- Management companies handle day-to-day operations, staffing, and guest services
- Examples of management companies: Aimbridge Hospitality, Interstate Hotels, White Lodging

**Management Company Name** (Required if "Yes" above):
- Enter the EXACT legal name of the management company
- This is the company that actually runs your hotel operations
- Examples: "Aimbridge Hospitality", "Interstate Hotels & Resorts"
- NOT the hotel brand name - the management company name

**Management Company Address** (Required if "Yes" above):
- Start typing the management company's headquarters address
- Use autocomplete when suggestions appear
- This is where the management company is headquartered
- Usually different from your hotel's address

**Management Company City/State/ZIP/Country** (Required if "Yes" above):
- Enter the complete address details for the management company
- City: Enter the city where management company is headquartered
- State: Enter 2-letter state code (US) or province name (international)
- ZIP: Enter postal code for management company headquarters
- Country: Select country where management company is based

**Management Company Website** (Optional):
- Enter the management company's corporate website
- Include "https://" at the beginning
- Examples: "https://www.aimbridgehospitality.com"
- This helps with verification and communication

#### Primary Contact Section - Step-by-Step Instructions

**Name** (Required):
- Enter the FULL name of the person who will handle government bookings
- First name and last name (middle name optional)
- Examples: "John Smith", "Maria Rodriguez", "David Johnson"
- This person will receive all government booking communications

**Title** (Required):
- Enter the official job title of the contact person
- Common titles: "General Manager", "Sales Manager", "Revenue Manager", "Director of Sales"
- Use the exact title as it appears on business cards or email signatures
- Examples: "General Manager", "Director of Sales & Marketing"

**Email** (Required):
- Enter the business email address for government communications
- This should be a professional email address
- Examples: "john.smith@hotelname.com", "sales@hotelname.com"
- This email will receive all booking confirmations and communications

**Phone** (Required):
- Enter the direct business phone number for the contact person
- NOT the general hotel reservation line
- Include area code and country code if international
- US format: (555) 123-4567
- International: +1-555-123-4567

**Mobile** (Optional):
- Enter the mobile/cell phone number for urgent communications
- Include country code for international numbers
- This is used for urgent booking issues or last-minute changes
- Format: (555) 123-4567 or +1-555-123-4567

**Preferred Contact Method** (Required):
- Select "Email" if you prefer email communications
- Select "Phone" if you prefer phone calls
- This determines how FEDEVENT will initially contact you
- You can change this preference later in your account settings

#### AAA Rating Section - Step-by-Step Instructions

**Are you an AAA rated hotel?** (Required):
- Select "Yes" ONLY if your hotel has an official AAA (American Automobile Association) rating
- AAA ratings are awarded by AAA inspectors who visit your property
- You must have a physical AAA plaque or certificate to select "Yes"
- If you're not sure, select "No" - you can update this later

**AAA Rating Level** (Required if "Yes" above):
- Select your hotel's diamond rating from the dropdown
- Available ratings: 2 Diamonds, 3 Diamonds, 4 Diamonds, 5 Diamonds
- 2 Diamonds: Basic accommodations, clean and comfortable
- 3 Diamonds: Good accommodations with additional amenities
- 4 Diamonds: Upscale accommodations with extensive amenities
- 5 Diamonds: Luxury accommodations with exceptional service
- If you don't know your exact rating, contact AAA or check your certificate

#### Banking Information Section - Step-by-Step Instructions

**IMPORTANT: This section is OPTIONAL and can be skipped entirely**
- You can leave all banking fields blank and proceed to the next step
- Banking information is only needed for payment processing
- You can add this information later in your account settings
- Skipping this section will NOT prevent you from completing registration

**If You Choose to Fill Banking Information**:

**Hotel Location** (Required if filling):
- Select "US" if your hotel is located in the United States
- Select "International" if your hotel is located outside the US
- This determines which banking fields you'll need to fill

**For US Hotels** (if you selected "US"):
- **Bank Name** (Required): Enter the name of your bank
- Examples: "Bank of America", "Wells Fargo", "Chase Bank"
- Use the official bank name, not abbreviations

- **Routing Number** (Required): Enter your bank's 9-digit routing number
- This is usually found on your checks or bank statements
- Format: 123456789 (9 digits, no dashes or spaces)
- This identifies your bank and location

- **Account Number** (Required): Enter your bank account number
- This is your specific account number at the bank
- Can be 8-17 digits depending on your bank
- Do NOT include the routing number in this field

- **Account Type** (Required): Select from dropdown
- "Checking" for business checking accounts
- "Savings" for business savings accounts
- Most hotels use "Checking" for government payments

**For International Hotels** (if you selected "International"):
- **Bank Name** (Required): Enter the name of your bank
- Examples: "HSBC", "Deutsche Bank", "Royal Bank of Canada"
- Use the official bank name in your country

- **SWIFT Code** (Required): Enter your bank's SWIFT/BIC code
- This is an 8-11 character code that identifies your bank internationally
- Format: ABCDUS33 or ABCDUS33XXX
- You can find this on your bank statements or by contacting your bank

- **IBAN** (Required): Enter your International Bank Account Number
- This is a unique identifier for your bank account
- Format varies by country (e.g., GB29 NWBK 6016 1331 9268 19)
- You can find this on your bank statements

- **Account Number** (Required): Enter your local bank account number
- This is your account number as it appears on your bank statements
- Format depends on your country's banking system

**Skip Option**: You can leave this entire section blank and move to the next step without any issues.

#### Room Information Section - Step-by-Step Instructions

**Total Guest Rooms** (Required):
- Count ALL guest rooms in your hotel
- Include standard rooms, suites, and specialty rooms
- Do NOT include meeting rooms, conference rooms, or public spaces
- Examples: If you have 150 rooms, enter "150"
- This is the total number of rooms available for guest accommodation

**Single Occupancy Rooms** (Required):
- Count rooms designed for one person
- Include king rooms, queen rooms, and twin rooms
- These are rooms with one bed
- Examples: If you have 75 king rooms, enter "75"
- This helps government clients understand single occupancy availability

**Double Occupancy Rooms** (Required):
- Count rooms designed for two people
- Include rooms with two beds or larger beds for two people
- Examples: rooms with 2 queen beds, 2 double beds, or 1 king bed for couples
- Examples: If you have 75 double rooms, enter "75"
- This helps government clients understand double occupancy availability

**Suite Information** (Optional):
- **Does your property have suites?** (Required): Select "Yes" or "No"
- If "Yes", you'll need to provide suite details
- Suites are larger rooms with separate living and sleeping areas
- Examples: Presidential Suite, Executive Suite, Family Suite

**Extended Stay Capabilities** (Required):
- **Is your property an Extended Stay hotel?** (Required): Select "Yes" or "No"
- Select "Yes" if your hotel caters to stays of 30+ days
- Extended stay hotels typically have kitchenettes, laundry facilities, and weekly housekeeping
- Examples: Residence Inn, Homewood Suites, Extended Stay America
- If "No", select "No" - this is for traditional hotels

**Extended Stay Amenities** (Required if "Yes" above):
- **In-Room Kitchen** (Required): Select "Yes" or "No"
- **Fully Equipped Kitchen** (Required): Select "Yes" or "No"
- **Washer/Dryer** (Required): Select from dropdown
- Options: "In-room", "On-site - self-service", "On-site - valet", "None"
- These amenities are important for long-term government stays

#### Meeting Space Section - Step-by-Step Instructions

**Do you have meeting space available?** (Required):
- Select "Yes" if your hotel has any meeting rooms, conference rooms, or event spaces
- Select "No" if your hotel only has guest rooms and no meeting facilities
- Meeting spaces include conference rooms, ballrooms, boardrooms, and event halls
- Even small meeting rooms count as "Yes"

**Meeting Room Details** (Required if "Yes" above):
- **Room Name** (Required): Enter the name of each meeting room
- Examples: "Grand Ballroom", "Conference Room A", "Boardroom", "Executive Suite"
- Use the official names as they appear on your property

- **Room Capacity** (Required): Enter the maximum number of people each room can accommodate
- This is the total capacity, not just seating
- Examples: "50", "100", "200", "500"
- Include both seating and standing room if applicable

- **Room Configuration** (Required): Select the primary seating arrangement
- "Theater Style": Rows of chairs facing front (like a movie theater)
- "Classroom Style": Tables and chairs for note-taking
- "Banquet Style": Round tables for dining and meetings
- "U-Shape": Tables arranged in a U-shape
- "Boardroom Style": Large table with chairs around it
- "Cocktail Style": Standing room with high-top tables

- **Room Dimensions** (Optional): Enter room size if known
- Examples: "30x40 feet", "1200 square feet"
- This helps government clients understand space requirements

**Audio/Visual Equipment** (Required if "Yes" above):
- **In-house A/V Services?** (Required): Select "Yes" or "No"
- Select "Yes" if your hotel provides audio/visual equipment and support
- Select "No" if clients must bring their own equipment

- **Available Equipment** (Required if "Yes" above):
- **Projectors**: Select "Yes" if you have projectors available
- **Screens**: Select "Yes" if you have projection screens
- **Sound System**: Select "Yes" if you have microphones and speakers
- **Lighting**: Select "Yes" if you have adjustable lighting
- **Recording**: Select "Yes" if you can record meetings/events
- **Live Streaming**: Select "Yes" if you can stream events live

**Catering Services** (Required if "Yes" above):
- **On-site Catering?** (Required): Select "Yes" or "No"
- Select "Yes" if your hotel provides food and beverage services
- Select "No" if clients must use external caterers

- **Catering Capabilities** (Required if "Yes" above):
- **Coffee Breaks**: Select "Yes" if you provide coffee and light snacks
- **Boxed Meals**: Select "Yes" if you provide boxed lunches
- **Hot Buffet**: Select "Yes" if you provide hot buffet meals
- **Plated Meals**: Select "Yes" if you provide formal plated dining
- **Reception**: Select "Yes" if you provide cocktail reception services

#### Seasonal Patterns Section - Step-by-Step Instructions

**Peak Season** (Required):
- Select ALL months when your hotel is busiest and rates are highest
- These are months when demand is highest and you charge premium rates
- Common peak seasons: Summer months (June-August), Holiday season (December), Spring break (March-April)
- Click on each month to select it (months will be highlighted)
- Examples: June, July, August for summer resorts; December for holiday destinations

**Shoulder Season** (Required):
- Select months with moderate demand and moderate rates
- These are months between peak and low seasons
- Demand is steady but not overwhelming
- Click on each month to select it
- Examples: May, September, October for many destinations

**Low Season** (Required):
- Select months with lowest demand and lowest rates
- These are months when you offer the best deals and have the most availability
- Click on each month to select it
- Examples: January, February, November for many destinations

**Blockout Dates** (Optional):
- Click "Add Blockout Date" to add specific dates when your hotel cannot accommodate government groups
- These are dates when your hotel is unavailable for government bookings
- Examples: Major renovations, private events, maintenance periods
- Format: Select start date and end date for each blockout period

**Citywide Events** (Optional):
- Click "Add Citywide Event" to add major events that affect your hotel's availability or pricing
- These are events that impact your entire city or region
- Examples: Conventions, festivals, sporting events, political events
- Include event name, dates, and how it affects your hotel (sold out, higher rates, etc.)

**Cancelled Space** (Optional):
- Click "Add Cancelled Space" to add dates when you had event space booked but it was cancelled
- These are dates when you might be flexible on pricing due to cancellation fees received
- Examples: Previously booked conference rooms that were cancelled
- Include event name, dates, and any special pricing you can offer

#### Amenities Section - Step-by-Step Instructions

**Property Amenities** (Required):
- Select ALL amenities that apply to your hotel
- These are hotel-wide amenities available to all guests
- Click on each category to expand and see options
- Select all that apply - you can select multiple options

**A. Property Amenities**:
- **Pool**: Select "Yes" if you have a swimming pool
- **Fitness Center**: Select "Yes" if you have a gym or fitness facility
- **Business Center**: Select "Yes" if you have computers and business services
- **Concierge**: Select "Yes" if you have concierge services
- **Valet Parking**: Select "Yes" if you offer valet parking services
- **Self-Parking**: Select "Yes" if you have self-parking available
- **Airport Shuttle**: Select "Yes" if you provide airport transportation
- **Pet-Friendly**: Select "Yes" if you allow pets
- **Smoke-Free**: Select "Yes" if your hotel is completely smoke-free

**B. Room Amenities**:
- **WiFi**: Select "Yes" if you provide free WiFi
- **Coffee Maker**: Select "Yes" if rooms have coffee makers
- **Mini-Fridge**: Select "Yes" if rooms have refrigerators
- **Microwave**: Select "Yes" if rooms have microwaves
- **Iron/Ironing Board**: Select "Yes" if rooms have ironing facilities
- **Hair Dryer**: Select "Yes" if rooms have hair dryers
- **Safe**: Select "Yes" if rooms have in-room safes
- **Balcony**: Select "Yes" if rooms have balconies
- **Kitchenette**: Select "Yes" if rooms have kitchenettes

**C. Dining Options**:
- **Restaurant**: Select "Yes" if you have a full-service restaurant
- **Bar/Lounge**: Select "Yes" if you have a bar or lounge
- **Room Service**: Select "Yes" if you offer room service
- **Breakfast**: Select "Yes" if you provide breakfast service
- **Coffee Shop**: Select "Yes" if you have a coffee shop or café
- **Grab & Go**: Select "Yes" if you have grab-and-go food options

**D. Transportation**:
- **Airport Shuttle**: Select "Yes" if you provide airport transportation
- **Valet Parking**: Select "Yes" if you offer valet parking
- **Self-Parking**: Select "Yes" if you have self-parking
- **Electric Vehicle Charging**: Select "Yes" if you have EV charging stations
- **Bicycle Rental**: Select "Yes" if you rent bicycles
- **Car Rental**: Select "Yes" if you have car rental services

**E. Recreation**:
- **Golf**: Select "Yes" if you have golf facilities
- **Spa**: Select "Yes" if you have spa services
- **Tennis**: Select "Yes" if you have tennis courts
- **Basketball**: Select "Yes" if you have basketball courts
- **Swimming Pool**: Select "Yes" if you have a swimming pool
- **Hot Tub**: Select "Yes" if you have a hot tub or jacuzzi
- **Game Room**: Select "Yes" if you have a game room or arcade

**F. Business Services**:
- **Meeting Rooms**: Select "Yes" if you have meeting rooms
- **Conference Facilities**: Select "Yes" if you have conference facilities
- **Business Center**: Select "Yes" if you have a business center
- **Copy/Fax Services**: Select "Yes" if you provide copy and fax services
- **Printing Services**: Select "Yes" if you provide printing services
- **Secretarial Services**: Select "Yes" if you provide secretarial services

**G. Accessibility**:
- **ADA Compliant**: Select "Yes" if your hotel meets ADA requirements
- **Wheelchair Accessible**: Select "Yes" if you have wheelchair accessible rooms
- **Elevator**: Select "Yes" if you have elevators
- **Accessible Parking**: Select "Yes" if you have accessible parking
- **TTY/TDD**: Select "Yes" if you have TTY/TDD services
- **Service Animals**: Select "Yes" if you allow service animals

#### Group Policies Section - Step-by-Step Instructions

**Max Group Block** (Required):
- Enter the maximum number of rooms you can block for a single government group
- This is the largest group size you can accommodate
- Examples: "50", "100", "200", "500"
- Consider your total room count and other bookings
- This helps government clients understand your capacity

**Cutoff Days** (Required):
- Enter the number of days before arrival when group blocks must be confirmed
- This is when you need to know if the group is definitely coming
- Common examples: "30", "45", "60", "90"
- This gives you time to release rooms if the group cancels
- Government groups often need longer lead times

**Cancellation Policy** (Required):
- Select your cancellation terms for group bookings
- Options: "24 hours", "48 hours", "72 hours", "1 week", "2 weeks", "30 days"
- This is when groups can cancel without penalty
- Government groups may need flexible cancellation terms
- Consider offering longer cancellation windows for government clients

**Deposit Requirements** (Required):
- Select when deposits are required
- Options: "At booking", "30 days before", "60 days before", "90 days before"
- This is when you need payment to hold the group block
- Government groups may have different payment terms
- Consider offering flexible deposit terms for government clients

**Group Rates** (Required):
- Select your group rate structure
- Options: "Same as individual rates", "5% discount", "10% discount", "15% discount", "Custom rates"
- Government groups often expect group discounts
- Consider offering competitive group rates
- You can set different rates for different group sizes

#### Concessions Section - Step-by-Step Instructions

**Complimentary Services** (Required):
- Select ALL free services you offer to guests
- These are amenities included in the room rate at no extra charge
- Select all that apply - you can select multiple options

**Free WiFi**: Select "Yes" if you provide complimentary WiFi
**Free Breakfast**: Select "Yes" if you provide complimentary breakfast
**Free Parking**: Select "Yes" if you provide complimentary parking
**Free Airport Shuttle**: Select "Yes" if you provide complimentary airport transportation
**Free Coffee**: Select "Yes" if you provide complimentary coffee
**Free Newspaper**: Select "Yes" if you provide complimentary newspapers
**Free Local Calls**: Select "Yes" if you provide complimentary local phone calls
**Free Gym Access**: Select "Yes" if you provide complimentary gym access
**Free Pool Access**: Select "Yes" if you provide complimentary pool access
**Free Business Center**: Select "Yes" if you provide complimentary business center access

**Upgrade Policies** (Required):
- Select your room upgrade policies
- Options: "No upgrades", "Upgrade on availability", "Upgrade for loyalty members", "Upgrade for government clients"
- Government clients may expect upgrade consideration
- Consider offering upgrades as a government benefit
- This can help attract government bookings

**Group Benefits** (Required):
- Select special benefits you offer to group bookings
- Options: "Welcome amenities", "Group check-in", "Dedicated staff", "Special rates", "Complimentary meeting space"
- Government groups often expect special treatment
- Consider offering group-specific benefits
- This can help differentiate your hotel

**Government Rates** (Required):
- Select your government rate structure
- Options: "Same as public rates", "5% discount", "10% discount", "15% discount", "Per diem rates"
- Government clients often expect special rates
- Consider offering competitive government rates
- Per diem rates are common for government travel

### Form Completion Summary for DANA

**Total Form Sections**: 13 comprehensive sections
**Required Fields**: Clearly marked with red asterisks (*)
**Optional Sections**: Banking Information (can be skipped entirely)
**Auto-Save**: Form automatically saves every 10 seconds
**Progress Tracking**: Step indicators show completion status
**Validation**: Real-time validation with error messages

**Key Points for DANA to Remember**:
1. **Banking Section is Optional**: Users can skip this entirely
2. **AAA Ratings**: Only 2-5 diamonds (not 1-5)
3. **Address Autocomplete**: Use when available, type manually if needed
4. **Required Fields**: Look for red asterisks (*)
5. **Dropdown Selections**: Must select actual options, not "Select..." placeholders
6. **Number Formats**: Use whole numbers for room counts, 4-digit years
7. **Phone Numbers**: Include country codes for international hotels
8. **Multi-Step Process**: Complete each step before proceeding
9. **Auto-Save**: Form saves progress automatically
10. **Skip Options**: Some sections can be skipped if not applicable

### Common Form Issues and Solutions

#### Address Autocomplete Not Working
- **Solution**: Type the full address manually if autocomplete fails
- **Alternative**: Use the map selection tool if available
- **Verification**: Double-check address format and spelling

#### Required Field Validation
- **Issue**: Form won't submit with missing required fields
- **Solution**: Look for red asterisks (*) indicating required fields
- **Check**: Ensure all dropdowns have selections, not just "Select..." options

#### File Upload Issues
- **Supported Formats**: PDF, Word documents, images
- **Size Limits**: Keep files under 10MB
- **Naming**: Use descriptive file names without special characters

#### Multi-Step Form Navigation
- **Progress**: Use the step indicators at the top to track progress
- **Auto-Save**: Form automatically saves every 10 seconds
- **Back/Next**: Use navigation buttons to move between steps
- **Validation**: Complete each step before proceeding to the next

#### Dropdown Selections
- **Chain Selection**: Choose from major chains or select "Other"
- **Brand Selection**: Select specific brand within the chain
- **Country Selection**: Choose from dropdown list
- **State Selection**: Use two-letter state codes for US locations

#### Number Field Requirements
- **Room Counts**: Enter whole numbers only (no decimals)
- **Years**: Use 4-digit format (e.g., 2020, not 20)
- **Phone Numbers**: Include country code for international numbers
- **Tax Rates**: Enter as percentages (e.g., 8.5 for 8.5%)

## Best Practices

### 1. Profile Optimization
- **Complete Information**: Fill all profile sections
- **High-Quality Photos**: Professional property images
- **Detailed Descriptions**: Comprehensive property information
- **Regular Updates**: Keep information current

### 2. Bidding Strategy
- **Quick Response**: Respond to opportunities promptly
- **Competitive Pricing**: Research market rates
- **Detailed Proposals**: Comprehensive bid submissions
- **Follow-up**: Track bid status and follow up

### 3. Contract Management
- **Performance Excellence**: Meet all contract requirements
- **Documentation**: Maintain detailed records
- **Communication**: Regular contact with government clients
- **Compliance**: Adhere to all government regulations

## Troubleshooting

### 1. Common Issues
- **Login Problems**: Check credentials and browser settings
- **Form Submission**: Verify all required fields
- **File Uploads**: Check file format and size limits
- **Email Notifications**: Check spam folder

### 2. Technical Support
- **Browser Issues**: Clear cache and cookies
- **JavaScript Errors**: Enable JavaScript
- **Connection Problems**: Check internet stability
- **Mobile Access**: Use responsive design features

### 3. Account Issues
- **Password Reset**: Use email reset function
- **Account Lockout**: Contact administrator
- **Permission Problems**: Check user roles
- **Data Issues**: Contact support team

## Government Contracting

### 1. Compliance Requirements
- **NET30 Payment Terms**: Accept government payment terms
- **PO Acceptance**: Process government purchase orders
- **Security Clearances**: Maintain required clearances
- **Certifications**: Keep credentials current

### 2. Contract Performance
- **Service Delivery**: Meet all contract requirements
- **Quality Standards**: Maintain high service levels
- **Reporting**: Submit required documentation
- **Communication**: Regular client contact

### 3. Business Development
- **Market Research**: Understand government needs
- **Relationship Building**: Develop client relationships
- **Competitive Analysis**: Monitor market trends
- **Growth Strategy**: Expand government business

## Contact Information

- **Email**: info@fedevent.com
- **Phone**: (305) 850-7848
- **Support**: Available 24/7 for hotel partners
- **Training**: Dedicated hotel partner support

## System Requirements

- **Browser**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **JavaScript**: Must be enabled
- **Internet**: Stable connection required
- **File Uploads**: PDF, Word, images supported
- **Mobile**: Responsive design for mobile devices

---

*This guide is designed for hotel users of the FEDEVENT platform. For government-specific functions, see the Government User Guide.*
