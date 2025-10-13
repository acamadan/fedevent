# 📊 Comprehensive Meeting Room Field Mapping

## Overview

This document details the complete field mapping between extracted OCR/AI data and the hotel registration form fields.

---

## Complete Field Mapping Table

| Extracted JSON Key | Form Field | Type | Conversion/Notes |
|-------------------|------------|------|------------------|
| `name` | Room Name * | Text | Direct mapping, **Required** |
| `level` | Level/Floor | Text | Direct (e.g., "1", "Mezzanine", "2nd Floor") |
| `sqFt` | Area (sq ft) * | Number | Direct mapping, **Required** |
| `sqFt` | Area (m²) | Number | **Auto-calculated**: `sqFt × 0.092903` |
| `lengthFt` | Length (ft) | Number | Optional, AI estimates if missing |
| `widthFt` | Width (ft) | Number | Optional, AI estimates if missing |
| `ceilingFt` | Ceiling (ft) | Number | Optional |
| `pillarFree` | Pillar-Free | Checkbox | Boolean → `checked` attribute |
| `naturalLight` | Natural Light | Checkbox | Boolean → `checked` attribute |
| `divisible` | Divisible | Checkbox | Boolean → `checked` attribute |
| `seating.banquet` | Banquet Rounds | Number | Optional seating capacity |
| `seating.theater` | Theater | Number | Optional seating capacity |
| `seating.classroom` | Classroom | Number | Optional seating capacity |
| `seating.uShape` | U-Shape | Number | Optional seating capacity |
| `seating.cocktail` | Cocktail | Number | Optional seating capacity |
| `seating.crescent` | Crescent Rounds | Number | Optional seating capacity |
| `seating.hollowSquare` | Hollow Square | Number | Optional seating capacity |
| `seating.conference` | Conference | Number | Optional seating capacity |
| `notes` | AI Notes | Display | Shows AI corrections/assumptions |

---

## JSON Structure

### Complete JSON Response from Hybrid Extraction

```json
{
  "meetingRooms": [
    {
      "name": "Grand Ballroom",
      "level": "1st Floor",
      "sqFt": 5000,
      "lengthFt": 100,
      "widthFt": 50,
      "ceilingFt": 20,
      "pillarFree": true,
      "naturalLight": true,
      "divisible": true,
      "seating": {
        "banquet": 300,
        "theater": 500,
        "classroom": 250,
        "uShape": 80,
        "cocktail": 600,
        "crescent": 280,
        "hollowSquare": 70,
        "conference": 100
      },
      "notes": "Fixed OCR error: '5OOO' → '5000'. Estimated dimensions based on square footage."
    },
    {
      "name": "Conference Room A",
      "level": "2",
      "sqFt": 1200,
      "lengthFt": 40,
      "widthFt": 30,
      "ceilingFt": 12,
      "pillarFree": true,
      "naturalLight": false,
      "divisible": false,
      "seating": {
        "banquet": 60,
        "theater": 100,
        "classroom": 50,
        "uShape": 30,
        "cocktail": 80,
        "crescent": null,
        "hollowSquare": 25,
        "conference": 40
      },
      "notes": null
    }
  ]
}
```

---

## Field Details

### 1. Basic Information

#### Room Name * (Required)
- **Type:** Text input
- **Validation:** Required field
- **Example:** "Grand Ballroom", "Conference Room A", "Board Room"
- **AI Behavior:** Direct extraction from OCR text

#### Level/Floor
- **Type:** Text input
- **Validation:** Optional
- **Example:** "1", "2nd Floor", "Mezzanine", "Ground Level"
- **AI Behavior:** Looks for floor indicators in text

---

### 2. Area Information

#### Area (sq ft) * (Required)
- **Type:** Number input
- **Validation:** Required, must be positive
- **Range:** 100-50,000 sq ft (AI validation)
- **AI Behavior:** 
  - Fixes OCR errors (O→0, I→1, etc.)
  - Validates reasonableness
  - Removes commas from numbers

#### Area (m²)
- **Type:** Number input (readonly)
- **Calculation:** `sqFt × 0.092903`
- **Auto-updates:** When sq ft value changes
- **Display:** 2 decimal places
- **Example:** 5000 sq ft → 464.52 m²

**Conversion Formula:**
```javascript
const sqM = (sqFt * 0.092903).toFixed(2);
```

---

### 3. Dimensions

#### Length (ft)
- **Type:** Number input
- **Validation:** Optional
- **AI Behavior:** 
  - Extracts from text if available
  - Estimates if missing: `√(sqFt × 1.5)`
  - Adds note if estimated

#### Width (ft)
- **Type:** Number input
- **Validation:** Optional
- **AI Behavior:**
  - Extracts from text if available
  - Estimates if missing: `√(sqFt / 1.5)`
  - Adds note if estimated

#### Ceiling (ft)
- **Type:** Number input
- **Validation:** Optional
- **Range:** 8-30 ft (AI validation)
- **AI Behavior:** Looks for ceiling height mentions

---

### 4. Room Features (Checkboxes)

#### Pillar-Free
- **Type:** Checkbox
- **Value:** Boolean (true/false)
- **AI Behavior:** 
  - Keywords: "pillar-free", "column-free", "no pillars", "no columns"
  - Default: false if not mentioned

#### Natural Light
- **Type:** Checkbox
- **Value:** Boolean (true/false)
- **AI Behavior:**
  - Keywords: "natural light", "windows", "daylight", "window wall"
  - Default: false if not mentioned

#### Divisible
- **Type:** Checkbox
- **Value:** Boolean (true/false)
- **AI Behavior:**
  - Keywords: "divisible", "airwall", "partitions", "can be divided"
  - Default: false if not mentioned

---

### 5. Seating Capacities

All seating types are **optional** number inputs.

#### Banquet Rounds
- **Description:** Banquet-style seating with round tables
- **Typical Ratio:** ~10 sq ft per person
- **Keywords:** "banquet", "rounds", "round tables"

#### Theater
- **Description:** Theater/auditorium style seating
- **Typical Ratio:** ~6 sq ft per person
- **Keywords:** "theater", "auditorium", "rows"

#### Classroom
- **Description:** Classroom style with tables and chairs
- **Typical Ratio:** ~12 sq ft per person
- **Keywords:** "classroom", "schoolroom"

#### U-Shape
- **Description:** U-shaped table configuration
- **Typical Ratio:** Based on perimeter
- **Keywords:** "u-shape", "u shape", "hollow u"

#### Cocktail
- **Description:** Standing cocktail reception
- **Typical Ratio:** ~6 sq ft per person
- **Keywords:** "cocktail", "reception", "standing"

#### Crescent Rounds
- **Description:** Crescent/half-moon table arrangement
- **Typical Ratio:** ~15 sq ft per person
- **Keywords:** "crescent", "half moon", "half rounds"

#### Hollow Square
- **Description:** Square table configuration with hollow center
- **Typical Ratio:** Based on perimeter
- **Keywords:** "hollow square", "square hollow"

#### Conference
- **Description:** Boardroom/conference table style
- **Typical Ratio:** ~25 sq ft per person
- **Keywords:** "conference", "boardroom", "board"

---

## AI Processing Rules

### OCR Error Corrections

The AI automatically fixes common OCR errors:

| OCR Error | Correction | Example |
|-----------|------------|---------|
| O (letter) | 0 (zero) | 5OOO → 5000 |
| I (letter) | 1 (one) | I200 → 1200 |
| S (letter) | 5 (five) | S00 → 500 |
| l (lowercase L) | 1 (one) | l50 → 150 |
| Comma removal | Number | 5,000 → 5000 |

### Data Validation

The AI validates all extracted data:

```javascript
// Square footage validation
if (sqFt < 100 || sqFt > 50000) {
  note: "Square footage seems unusual, please verify"
}

// Ceiling height validation
if (ceilingFt < 8 || ceilingFt > 30) {
  note: "Ceiling height seems unusual, please verify"
}

// Capacity validation
if (capacity < 1 || capacity > 5000) {
  note: "Capacity seems unusual, please verify"
}
```

### Missing Data Handling

When data is missing, the AI:

1. **Never invents data** - Returns `null` for missing fields
2. **May estimate** - Only for dimensions when sqFt is known
3. **Always notes** - Adds explanation when estimating

---

## Form Display

### Visual Organization

The extracted data is displayed in a structured card format:

```
┌─────────────────────────────────────────┐
│ 📍 Room 1: Grand Ballroom              │
├─────────────────────────────────────────┤
│ 🤖 AI Note: [corrections/assumptions]  │
├─────────────────────────────────────────┤
│ Basic Information                       │
│ [Room Name*] [Level/Floor]             │
├─────────────────────────────────────────┤
│ Area Information                        │
│ [Area sq ft*] [Area m² (auto)]         │
├─────────────────────────────────────────┤
│ Dimensions                              │
│ [Length] [Width] [Ceiling]             │
├─────────────────────────────────────────┤
│ Room Features                           │
│ ☑ Pillar-Free ☑ Natural Light          │
│ ☑ Divisible                            │
├─────────────────────────────────────────┤
│ Seating Capacities                      │
│ [Banquet] [Theater] [Classroom] ...    │
└─────────────────────────────────────────┘
```

### Color Coding

- **Gray background** (#f9fafb): Room features section
- **Blue background** (#f0f9ff): Seating capacities section
- **Yellow background** (#fef3c7): AI notes
- **White background** (#ffffff): Main card

---

## Usage Example

### Sample Fact Sheet Content

```
HOTEL MEETING SPACES

Room Name            Level    Sq Ft    Length  Width  Height  Features
--------------------------------------------------------------------------------
Grand Ballroom       1        5,000    100     50     20      Pillar-free, Divisible
Conference Room A    2        1,200    40      30     12      Natural light
Board Room           2        800      32      25     10      Pillar-free

SEATING CAPACITIES

Room                 Banquet  Theater  Classroom  U-Shape  Cocktail
--------------------------------------------------------------------------------
Grand Ballroom       300      500      250        80       600
Conference Room A    60       100      50         30       80
Board Room           40       60       30         20       50
```

### Extracted JSON

```json
{
  "meetingRooms": [
    {
      "name": "Grand Ballroom",
      "level": "1",
      "sqFt": 5000,
      "lengthFt": 100,
      "widthFt": 50,
      "ceilingFt": 20,
      "pillarFree": true,
      "naturalLight": false,
      "divisible": true,
      "seating": {
        "banquet": 300,
        "theater": 500,
        "classroom": 250,
        "uShape": 80,
        "cocktail": 600
      },
      "notes": "Removed comma from square footage"
    }
  ]
}
```

---

## Testing

### Test Scenarios

1. **Complete Data** - All fields present
2. **Partial Data** - Only basic fields (name, sqFt)
3. **OCR Errors** - Numbers with letter O's and I's
4. **Missing Dimensions** - Only sqFt provided
5. **No Seating Data** - Only room specs
6. **Mixed Boolean Keywords** - Various ways to express features

### Expected Behavior

| Scenario | Expected Result |
|----------|----------------|
| All fields present | All fields populated accurately |
| Partial data | Missing fields left empty, no estimation |
| OCR errors | Corrected with note |
| Missing dimensions | Estimated with note (optional) |
| No seating | Seating fields left empty |
| Boolean keywords | Correctly interpreted as true/false |

---

## Troubleshooting

### Common Issues

**Issue:** m² not calculating
- **Cause:** JavaScript not running or sq ft field missing data attribute
- **Fix:** Check console for errors, verify `data-index` attribute

**Issue:** Checkboxes not checking
- **Cause:** Boolean value not properly extracted
- **Fix:** Verify JSON has true/false, not strings "true"/"false"

**Issue:** Seating capacities not showing
- **Cause:** Nested seating object not found
- **Fix:** Check JSON structure has `seating` object with sub-fields

**Issue:** AI notes not displaying
- **Cause:** `includeNotes` parameter not set to true
- **Fix:** Ensure hybrid endpoint call uses `displayExtractedRooms(data.meetingRooms, true)`

---

## API Response Schema

### TypeScript Interface

```typescript
interface MeetingRoom {
  name: string;              // Required
  level?: string;            // Optional
  sqFt: number;             // Required
  lengthFt?: number;        // Optional
  widthFt?: number;         // Optional
  ceilingFt?: number;       // Optional
  pillarFree?: boolean;     // Optional, default false
  naturalLight?: boolean;   // Optional, default false
  divisible?: boolean;      // Optional, default false
  seating?: {               // Optional
    banquet?: number;
    theater?: number;
    classroom?: number;
    uShape?: number;
    cocktail?: number;
    crescent?: number;
    hollowSquare?: number;
    conference?: number;
  };
  notes?: string;           // Optional, AI explanations
}

interface ExtractionResponse {
  meetingRooms: MeetingRoom[];
  warning?: string;         // If AI processing had issues
}
```

---

## Performance

### Processing Time

- **Simple OCR:** 5-15 seconds
- **Hybrid AI:** 15-45 seconds (depending on pages and complexity)

### Token Usage

- **Basic extraction:** ~100-200 tokens
- **Comprehensive extraction:** ~300-800 tokens
- **Cost per document:** ~$0.003-0.015

---

## Future Enhancements

Potential additions to field mapping:

- [ ] Built-in AV equipment details
- [ ] Power outlet locations and count
- [ ] Loading door dimensions
- [ ] Foyer/pre-function space sqft
- [ ] Maximum weight capacity
- [ ] Soundproofing details
- [ ] Blackout capabilities
- [ ] Dance floor availability

---

**Last Updated:** October 8, 2025
**Version:** 2.0 - Comprehensive Field Mapping
