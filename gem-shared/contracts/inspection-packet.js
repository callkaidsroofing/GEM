/**
 * Inspection Packet Contract
 *
 * Defines the inspection_packet_v1 schema for multimodal inspection data.
 * This is the normalized format for inspection pipeline processing.
 */

/**
 * Schema version identifier
 */
export const INSPECTION_PACKET_VERSION = 'inspection_packet_v1';

/**
 * Valid defect types
 */
export const DEFECT_TYPES = ['tile', 'ridge', 'valley', 'flashing', 'gutter', 'leak', 'other'];

/**
 * Valid defect severities
 */
export const DEFECT_SEVERITIES = ['low', 'medium', 'high'];

/**
 * Inspection packet v1 JSON Schema
 */
export const INSPECTION_PACKET_V1_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'inspection_packet_v1',
  type: 'object',
  required: ['schema_version', 'lead_id'],
  properties: {
    schema_version: {
      const: INSPECTION_PACKET_VERSION,
      description: 'Schema version identifier'
    },
    lead_id: {
      type: 'string',
      format: 'uuid',
      description: 'UUID of the associated lead'
    },
    site_address: {
      type: 'string',
      description: 'Street address of inspection site'
    },
    site_suburb: {
      type: 'string',
      description: 'Suburb/locality of inspection site'
    },
    scheduled_at: {
      type: 'string',
      format: 'date-time',
      description: 'Scheduled inspection date/time'
    },
    photos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            format: 'uri',
            description: 'URL or storage reference to photo'
          },
          caption: {
            type: 'string',
            description: 'Photo caption/description'
          },
          location: {
            type: 'string',
            description: 'Location on property where photo was taken'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Classification tags (before/after/defect/etc)'
          },
          taken_at: {
            type: 'string',
            format: 'date-time',
            description: 'When photo was taken'
          }
        }
      },
      description: 'Photos attached to inspection'
    },
    measurements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'value', 'unit'],
        properties: {
          type: {
            type: 'string',
            description: 'Measurement type (area, length, count, pitch, etc)'
          },
          value: {
            type: 'number',
            description: 'Numeric measurement value'
          },
          unit: {
            type: 'string',
            description: 'Unit of measurement (m, m2, degrees, count)'
          },
          location: {
            type: 'string',
            description: 'Where measurement was taken'
          },
          notes: {
            type: 'string',
            description: 'Additional notes about measurement'
          },
          recorded_at: {
            type: 'string',
            format: 'date-time',
            description: 'When measurement was recorded'
          }
        }
      },
      description: 'Measurements taken during inspection'
    },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'severity'],
        properties: {
          type: {
            enum: DEFECT_TYPES,
            description: 'Category of defect'
          },
          severity: {
            enum: DEFECT_SEVERITIES,
            description: 'Severity level'
          },
          location: {
            type: 'string',
            description: 'Location on property'
          },
          description: {
            type: 'string',
            description: 'Detailed description of defect'
          },
          photo_refs: {
            type: 'array',
            items: { type: 'string' },
            description: 'References to associated photos'
          },
          recorded_at: {
            type: 'string',
            format: 'date-time',
            description: 'When defect was recorded'
          }
        }
      },
      description: 'Defects identified during inspection'
    },
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        required: ['item_name', 'checked'],
        properties: {
          item_name: {
            type: 'string',
            description: 'Checklist item name'
          },
          checked: {
            type: 'boolean',
            description: 'Whether item passed/is checked'
          },
          notes: {
            type: 'string',
            description: 'Additional notes for this item'
          },
          checked_at: {
            type: 'string',
            format: 'date-time',
            description: 'When item was checked'
          }
        }
      },
      description: 'Inspection checklist items'
    },
    notes: {
      type: 'string',
      description: 'General inspection notes'
    },
    inspector: {
      type: 'string',
      description: 'Name or ID of inspector'
    },
    completed_at: {
      type: 'string',
      format: 'date-time',
      description: 'When inspection was completed'
    }
  }
};

/**
 * Normalize raw inspection data into inspection_packet_v1 format
 *
 * @param {Object} rawData - Raw inspection data from various sources
 * @returns {{ packet: Object, warnings: string[] }}
 */
export function normalizeInspectionPacket(rawData) {
  const warnings = [];
  const now = new Date().toISOString();

  // Start with required fields
  const packet = {
    schema_version: INSPECTION_PACKET_VERSION,
    lead_id: rawData.lead_id
  };

  // Validate lead_id
  if (!rawData.lead_id) {
    warnings.push('Missing required field: lead_id');
  }

  // Optional string fields
  if (rawData.site_address) packet.site_address = String(rawData.site_address);
  if (rawData.site_suburb) packet.site_suburb = String(rawData.site_suburb);
  if (rawData.scheduled_at) packet.scheduled_at = rawData.scheduled_at;
  if (rawData.notes) packet.notes = String(rawData.notes);
  if (rawData.inspector) packet.inspector = String(rawData.inspector);
  if (rawData.completed_at) packet.completed_at = rawData.completed_at;

  // Normalize photos
  if (rawData.photos && Array.isArray(rawData.photos)) {
    packet.photos = rawData.photos.map((photo, idx) => {
      const normalized = {
        url: photo.url || photo.file_ref || photo.src,
        caption: photo.caption || photo.label || null,
        location: photo.location || null,
        tags: Array.isArray(photo.tags) ? photo.tags : [],
        taken_at: photo.taken_at || photo.added_at || null
      };

      if (!normalized.url) {
        warnings.push(`Photo at index ${idx} missing URL`);
        // Check for base64
        if (photo.base64) {
          warnings.push(`Photo at index ${idx} has base64 data - should be uploaded first`);
        }
      }

      return normalized;
    }).filter(p => p.url);
  }

  // Normalize measurements
  if (rawData.measurements && Array.isArray(rawData.measurements)) {
    packet.measurements = rawData.measurements.map((m, idx) => {
      const normalized = {
        type: m.type || m.measurement_type || m.label || 'unknown',
        value: typeof m.value === 'number' ? m.value : parseFloat(m.value),
        unit: m.unit || 'm',
        location: m.location || null,
        notes: m.notes || null,
        recorded_at: m.recorded_at || now
      };

      if (isNaN(normalized.value)) {
        warnings.push(`Measurement at index ${idx} has invalid value`);
        normalized.value = 0;
      }

      return normalized;
    });
  }

  // Normalize defects
  if (rawData.defects && Array.isArray(rawData.defects)) {
    packet.defects = rawData.defects.map((d, idx) => {
      let type = d.type || d.defect_type || d.category || 'other';
      if (!DEFECT_TYPES.includes(type)) {
        warnings.push(`Defect at index ${idx} has unknown type '${type}', defaulting to 'other'`);
        type = 'other';
      }

      let severity = d.severity || 'medium';
      if (!DEFECT_SEVERITIES.includes(severity)) {
        warnings.push(`Defect at index ${idx} has unknown severity '${severity}', defaulting to 'medium'`);
        severity = 'medium';
      }

      return {
        type,
        severity,
        location: d.location || null,
        description: d.description || d.notes || null,
        photo_refs: Array.isArray(d.photo_refs) ? d.photo_refs : [],
        recorded_at: d.recorded_at || now
      };
    });
  }

  // Normalize checklist
  if (rawData.checklist && Array.isArray(rawData.checklist)) {
    packet.checklist = rawData.checklist.map((item, idx) => {
      // Handle various input formats
      let itemName = item.item_name || item.item || item.name || item.label;
      let checked = item.checked;

      // Handle status-based format
      if (item.status !== undefined) {
        checked = item.status === 'pass' || item.status === true || item.status === 'checked';
      }

      if (checked === undefined) {
        warnings.push(`Checklist item at index ${idx} missing checked status`);
        checked = false;
      }

      if (!itemName) {
        warnings.push(`Checklist item at index ${idx} missing name`);
        itemName = `Item ${idx + 1}`;
      }

      return {
        item_name: String(itemName),
        checked: Boolean(checked),
        notes: item.notes || null,
        checked_at: item.checked_at || item.added_at || now
      };
    });
  }

  return { packet, warnings };
}

/**
 * Validate an inspection packet against the schema
 *
 * @param {Object} packet - Inspection packet to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateInspectionPacket(packet) {
  const errors = [];

  if (!packet) {
    errors.push('Packet is null or undefined');
    return { valid: false, errors };
  }

  // Check schema version
  if (packet.schema_version !== INSPECTION_PACKET_VERSION) {
    errors.push(`Invalid schema_version: expected '${INSPECTION_PACKET_VERSION}', got '${packet.schema_version}'`);
  }

  // Check lead_id
  if (!packet.lead_id) {
    errors.push('Missing required field: lead_id');
  }

  // Validate defect types
  if (packet.defects && Array.isArray(packet.defects)) {
    packet.defects.forEach((d, idx) => {
      if (!DEFECT_TYPES.includes(d.type)) {
        errors.push(`Defect at index ${idx} has invalid type: ${d.type}`);
      }
      if (!DEFECT_SEVERITIES.includes(d.severity)) {
        errors.push(`Defect at index ${idx} has invalid severity: ${d.severity}`);
      }
    });
  }

  // Validate measurements have numeric values
  if (packet.measurements && Array.isArray(packet.measurements)) {
    packet.measurements.forEach((m, idx) => {
      if (typeof m.value !== 'number' || isNaN(m.value)) {
        errors.push(`Measurement at index ${idx} has non-numeric value`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create an empty inspection packet template
 *
 * @param {string} leadId - Lead UUID
 * @returns {Object} Empty inspection packet
 */
export function createEmptyPacket(leadId) {
  return {
    schema_version: INSPECTION_PACKET_VERSION,
    lead_id: leadId,
    photos: [],
    measurements: [],
    defects: [],
    checklist: []
  };
}
