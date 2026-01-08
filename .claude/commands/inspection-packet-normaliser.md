---
description: Normalize multimodal inspection data into inspection_packet_v1 schema
allowed-tools:
  - Read
---

# Inspection Packet Normaliser

Normalize raw multimodal inspection data into the standardized `inspection_packet_v1` schema.

## Input

Raw inspection data from various sources (mobile app, webhook, manual entry):

```json
{
  "lead_id": "abc123",
  "photos": [
    { "url": "https://storage.example.com/photo1.jpg", "caption": "Front roof" },
    { "base64": "...", "location": "ridge" }
  ],
  "measurements": [
    { "type": "area", "value": 150, "unit": "m2" }
  ],
  "defects": [
    { "type": "tile", "severity": "high", "description": "Cracked tiles" }
  ],
  "checklist": [
    { "item": "Gutters clear", "status": "pass" }
  ]
}
```

## Process

### Step 1: Validate Required Fields

Check for required fields:
- `lead_id` - Required, must be valid UUID format
- At least one of: photos, measurements, defects, or checklist

### Step 2: Normalize Photos

Transform photos to standard format:

```javascript
// Input formats accepted:
{ url: "..." }                    // URL reference
{ file_ref: "..." }               // Storage reference
{ src: "..." }                    // Legacy format
{ base64: "..." }                 // Needs upload first - add warning

// Output format:
{
  url: "https://...",
  caption: "Front roof",
  location: null,
  tags: ["exterior"],
  taken_at: null
}
```

### Step 3: Normalize Measurements

Transform measurements:

```javascript
// Input formats accepted:
{ type: "area", value: 150, unit: "m2" }
{ measurement_type: "roof_area", value: "150", unit: "sqm" }
{ label: "Ridge length", value: 12.5 }

// Output format:
{
  type: "area",
  value: 150,               // Numeric
  unit: "m2",
  location: null,
  notes: null,
  recorded_at: "2026-01-09T..."
}
```

### Step 4: Normalize Defects

Transform defects with type/severity validation:

```javascript
// Valid types: tile, ridge, valley, flashing, gutter, leak, other
// Valid severities: low, medium, high

// Input formats:
{ type: "tile", severity: "high", description: "Cracked" }
{ category: "tiles", level: "severe", notes: "Multiple cracks" }

// Output format:
{
  type: "tile",              // Validated against enum
  severity: "high",          // Validated against enum
  location: null,
  description: "Cracked",
  photo_refs: [],
  recorded_at: "2026-01-09T..."
}
```

### Step 5: Normalize Checklist

Transform checklist items:

```javascript
// Input formats:
{ item: "Gutters clear", status: "pass" }
{ item_name: "Gutters", checked: true }
{ name: "Roof access", status: true }

// Output format:
{
  item_name: "Gutters clear",
  checked: true,
  notes: null,
  checked_at: "2026-01-09T..."
}
```

## Output Format

```json
{
  "packet": {
    "schema_version": "inspection_packet_v1",
    "lead_id": "abc123",
    "site_address": "45 Smith St",
    "site_suburb": "Brisbane",
    "photos": [
      {
        "url": "https://storage.example.com/photo1.jpg",
        "caption": "Front roof",
        "location": null,
        "tags": ["exterior"],
        "taken_at": null
      }
    ],
    "measurements": [
      {
        "type": "area",
        "value": 150,
        "unit": "m2",
        "location": null,
        "notes": null,
        "recorded_at": "2026-01-09T00:00:00.000Z"
      }
    ],
    "defects": [
      {
        "type": "tile",
        "severity": "high",
        "location": null,
        "description": "Cracked tiles",
        "photo_refs": [],
        "recorded_at": "2026-01-09T00:00:00.000Z"
      }
    ],
    "checklist": [
      {
        "item_name": "Gutters clear",
        "checked": true,
        "notes": null,
        "checked_at": "2026-01-09T00:00:00.000Z"
      }
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": [
      "Photo at index 1 has base64 data - should be uploaded first"
    ]
  },
  "statistics": {
    "photo_count": 2,
    "measurement_count": 1,
    "defect_count": 1,
    "checklist_count": 1,
    "high_severity_defects": 1
  },
  "tool_calls": [
    {
      "order": 1,
      "tool_name": "inspection.create",
      "input": { "lead_id": "abc123" }
    },
    {
      "order": 2,
      "tool_name": "inspection.add_measurement",
      "input": { "inspection_id": "<pending>", "measurement_type": "area", "value": 150, "unit": "m2" }
    },
    {
      "order": 3,
      "tool_name": "inspection.add_defect",
      "input": { "inspection_id": "<pending>", "defect_type": "tile", "severity": "high" }
    },
    {
      "order": 4,
      "tool_name": "inspection.add_checklist_item",
      "input": { "inspection_id": "<pending>", "item_name": "Gutters clear", "checked": true }
    }
  ]
}
```

## Validation Rules

| Field | Rule | Error Level |
|-------|------|-------------|
| lead_id | Required, UUID format | ERROR |
| defect.type | Must be valid enum | ERROR (defaults to 'other') |
| defect.severity | Must be valid enum | WARNING (defaults to 'medium') |
| measurement.value | Must be numeric | ERROR |
| photo.url | Required if no base64 | WARNING |

## Reference

Schema location: `gem-shared/schemas/inspection-packet-v1.json`
Contract location: `gem-shared/contracts/inspection-packet.js`

## Usage

```
Input: Raw inspection data object
Output: Normalized inspection_packet_v1 with validation and suggested tool calls
```
