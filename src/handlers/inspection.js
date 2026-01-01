/**
 * Inspection handlers
 * These handlers return 'not_configured' status as they require
 * additional domain tables and integration setup.
 * They never throw errors to ensure worker loop stability.
 */

/**
 * Helper to create a not_configured response
 */
function notConfigured(toolName) {
  return {
    result: {
      status: 'not_configured',
      message: `Handler for ${toolName} requires additional configuration`
    },
    effects: {}
  };
}

/**
 * inspection.create - Create an inspection record
 */
export async function create(input) {
  return notConfigured('inspection.create');
}

/**
 * inspection.add_checklist_item - Add a checklist item to an inspection
 */
export async function add_checklist_item(input) {
  return notConfigured('inspection.add_checklist_item');
}

/**
 * inspection.add_measurement - Add a measurement to an inspection
 */
export async function add_measurement(input) {
  return notConfigured('inspection.add_measurement');
}

/**
 * inspection.add_photo_ref - Attach a media reference to an inspection
 */
export async function add_photo_ref(input) {
  return notConfigured('inspection.add_photo_ref');
}

/**
 * inspection.add_defect - Record a defect on an inspection
 */
export async function add_defect(input) {
  return notConfigured('inspection.add_defect');
}

/**
 * inspection.generate_scope_summary - Generate a scope summary from inspection data
 */
export async function generate_scope_summary(input) {
  return notConfigured('inspection.generate_scope_summary');
}

/**
 * inspection.lock - Lock an inspection to prevent further edits
 */
export async function lock(input) {
  return notConfigured('inspection.lock');
}
