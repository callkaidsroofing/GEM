/**
 * CKR-GEM Canonical Services Registry
 *
 * Implements the High Council "Canonical Services Locking" pattern.
 * Prevents hallucination by enforcing a locked list of services.
 *
 * Features:
 * - Hard-coded canonical service list from marketing doctrine
 * - Service validation with fuzzy matching
 * - "No CKR source found" response for unknown services
 * - Service variations and synonyms support
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCTRINE_PATH = join(__dirname, '../../.knowledge/doctrine/CKR_MARKETING_DOCTRINE.json');

/**
 * CKR Canonical Services (Hard-coded from marketing doctrine)
 *
 * These are the ONLY services CKR offers. Any query about services
 * not in this list should return "No CKR source found".
 */
export const CANONICAL_SERVICES = [
  {
    id: 'roof_health_check',
    name: 'Roof Health Check (Inspection + Photo Report)',
    shortName: 'Roof Inspection',
    keywords: ['inspection', 'check', 'report', 'assess', 'condition'],
    variations: [
      'General condition check',
      'Leak-focused check',
      'Pre-sale roof check',
      'Post-storm roof check',
      'Rental / property manager report'
    ],
    roofTypes: ['concrete_tile', 'terracotta_tile', 'colorbond', 'metal']
  },
  {
    id: 'roof_restoration',
    name: 'Roof Restorations (Full Restoration includes painting)',
    shortName: 'Roof Restoration',
    keywords: ['restoration', 'restore', 'repair', 'rebedding', 'repointing', 'full'],
    variations: [
      'Tile restoration (concrete)',
      'Tile restoration (terracotta)',
      'Metal roof restoration',
      'Partial restoration (repairs only)',
      'Full restoration (repairs + paint)'
    ],
    roofTypes: ['concrete_tile', 'terracotta_tile', 'colorbond', 'metal'],
    lockedSequence: ['Rebedding', 'Cleaning', 'Repointing', 'Painting']
  },
  {
    id: 'roof_painting',
    name: 'Roof Painting / Coatings (Industrial Roof Coating Systems)',
    shortName: 'Roof Painting',
    keywords: ['painting', 'coating', 'colour', 'color', 'membrane'],
    variations: [
      'Concrete tile coating',
      'Terracotta coating',
      'Metal roof coating',
      'Colour change'
    ],
    roofTypes: ['concrete_tile', 'terracotta_tile', 'colorbond', 'metal'],
    systems: ['Roof Refresh', 'Roof Protect', '20-Year Roof Protect']
  },
  {
    id: 'roof_cleaning',
    name: 'High-Pressure Washing / Soft Washing / Moss Treatment',
    shortName: 'Roof Cleaning',
    keywords: ['cleaning', 'wash', 'pressure', 'moss', 'lichen', 'soft wash'],
    variations: [
      'High-pressure cleaning (up to 4000 PSI)',
      'Soft wash',
      'Moss and lichen treatment',
      'Pre-restoration clean'
    ],
    roofTypes: ['concrete_tile', 'terracotta_tile', 'colorbond', 'metal']
  },
  {
    id: 'ridge_capping',
    name: 'Ridge Capping Rebedding & Repointing (incl. Gables)',
    shortName: 'Ridge Capping',
    keywords: ['ridge', 'capping', 'bedding', 'pointing', 'gable'],
    variations: [
      'Ridge cap rebedding',
      'Ridge cap repointing',
      'Gable end repair',
      'Hip ridge repair'
    ],
    roofTypes: ['concrete_tile', 'terracotta_tile']
  },
  {
    id: 'valley_replacement',
    name: 'Valley Iron Replacement',
    shortName: 'Valley Replacement',
    keywords: ['valley', 'iron', 'replacement', 'rusty', 'corroded'],
    variations: [
      'Full valley replacement',
      'Partial valley repair',
      'Valley flashing renewal'
    ],
    roofTypes: ['concrete_tile', 'terracotta_tile', 'metal']
  },
  {
    id: 'gutter_cleaning',
    name: 'Gutter Cleaning',
    shortName: 'Gutter Cleaning',
    keywords: ['gutter', 'gutters', 'downpipe', 'blocked', 'overflow'],
    variations: [
      'Standard gutter clean',
      'Post-restoration gutter clean',
      'Downpipe flush'
    ],
    roofTypes: ['all']
  },
  {
    id: 'leak_detection',
    name: 'Leak Detection',
    shortName: 'Leak Detection',
    keywords: ['leak', 'leaking', 'water', 'dripping', 'ceiling', 'stain'],
    variations: [
      'Active leak investigation',
      'Water ingress detection',
      'Leak source identification'
    ],
    roofTypes: ['all']
  },
  {
    id: 'tile_replacement',
    name: 'Broken Tile Replacement',
    shortName: 'Tile Replacement',
    keywords: ['tile', 'broken', 'cracked', 'replace', 'missing'],
    variations: [
      'Single tile replacement',
      'Multiple tile replacement',
      'Tile colour matching'
    ],
    roofTypes: ['concrete_tile', 'terracotta_tile']
  },
  {
    id: 'reroof',
    name: 'Re-roofing + New Roofs',
    shortName: 'Re-roofing',
    keywords: ['reroof', 're-roof', 'new roof', 'replace', 'strip'],
    variations: [
      'Full re-roof (tile to tile)',
      'Full re-roof (tile to metal)',
      'Metal re-roof',
      'New construction roofing'
    ],
    roofTypes: ['all']
  }
];

/**
 * Services CKR explicitly does NOT offer (for clear refusal)
 */
export const EXCLUDED_SERVICES = [
  {
    name: 'Asbestos Removal',
    reason: 'Requires licensed asbestos removal specialists',
    referral: 'Refer to licensed asbestos removal contractor'
  },
  {
    name: 'Structural Repairs',
    reason: 'Beyond roofing scope',
    referral: 'Refer to builder/carpenter/structural engineer'
  },
  {
    name: 'Plumbing',
    reason: 'Not roofing scope',
    referral: 'Refer to licensed plumber'
  },
  {
    name: 'HVAC/Ducting',
    reason: 'Not roofing scope',
    referral: 'Refer to HVAC specialist'
  },
  {
    name: 'Solar Panel Installation',
    reason: 'Requires licensed electrician',
    referral: 'Refer to solar installer'
  },
  {
    name: 'Skylights',
    reason: 'May require specialist',
    referral: 'Assess on case-by-case basis'
  }
];

/**
 * Canonical Services Manager
 */
export class CanonicalServicesManager {
  constructor(config = {}) {
    this.services = CANONICAL_SERVICES;
    this.excluded = EXCLUDED_SERVICES;
    this.dynamicDoctrine = null;

    // Load doctrine if available
    if (config.loadDoctrine !== false) {
      this._loadDoctrine();
    }
  }

  /**
   * Validate if a query matches a canonical service
   *
   * @param {string} query - User query or service request
   * @returns {object} { valid, service?, fallback?, confidence }
   */
  validateService(query) {
    if (!query || typeof query !== 'string') {
      return {
        valid: false,
        fallback: 'No CKR source found',
        confidence: 0
      };
    }

    const lowerQuery = query.toLowerCase();

    // Check for excluded services first
    const excluded = this._checkExcluded(lowerQuery);
    if (excluded) {
      return {
        valid: false,
        excluded: true,
        service: excluded.name,
        reason: excluded.reason,
        referral: excluded.referral,
        fallback: `CKR does not offer ${excluded.name}. ${excluded.reason}`,
        confidence: 0.9
      };
    }

    // Find best matching canonical service
    const match = this._findBestMatch(lowerQuery);

    if (match.confidence >= 0.5) {
      return {
        valid: true,
        service: match.service,
        variation: match.variation,
        confidence: match.confidence
      };
    }

    // Check if it's a roofing-related query without service match
    const isRoofingRelated = this._isRoofingRelated(lowerQuery);

    if (isRoofingRelated) {
      return {
        valid: false,
        fallback: 'No exact CKR service match found',
        suggestion: 'Please describe the roof issue more specifically',
        confidence: 0.3
      };
    }

    return {
      valid: false,
      fallback: 'No CKR source found',
      confidence: 0
    };
  }

  /**
   * Get all canonical service names
   */
  getServiceNames() {
    return this.services.map(s => s.name);
  }

  /**
   * Get all short service names
   */
  getShortNames() {
    return this.services.map(s => s.shortName);
  }

  /**
   * Get service by ID
   */
  getServiceById(id) {
    return this.services.find(s => s.id === id);
  }

  /**
   * Get services for a roof type
   */
  getServicesForRoofType(roofType) {
    return this.services.filter(s =>
      s.roofTypes.includes('all') || s.roofTypes.includes(roofType)
    );
  }

  /**
   * Format services list for LLM context
   */
  formatForContext() {
    const lines = ['CKR CANONICAL SERVICES:'];

    this.services.forEach(s => {
      lines.push(`  - ${s.shortName}`);
    });

    lines.push('\nSERVICES NOT OFFERED:');
    this.excluded.forEach(e => {
      lines.push(`  - ${e.name} (${e.reason})`);
    });

    return lines.join('\n');
  }

  // Private methods

  _loadDoctrine() {
    try {
      if (existsSync(DOCTRINE_PATH)) {
        this.dynamicDoctrine = JSON.parse(readFileSync(DOCTRINE_PATH, 'utf8'));
        console.log('[CanonicalServices] Loaded doctrine');
      }
    } catch (error) {
      console.warn('[CanonicalServices] Failed to load doctrine:', error.message);
    }
  }

  _checkExcluded(query) {
    for (const excluded of this.excluded) {
      const nameLower = excluded.name.toLowerCase();
      if (query.includes(nameLower) ||
          query.includes(nameLower.replace(' ', ''))) {
        return excluded;
      }
    }

    // Additional exclusion keywords
    const exclusionKeywords = [
      { pattern: /asbestos/, service: this.excluded[0] },
      { pattern: /structur/, service: this.excluded[1] },
      { pattern: /plumb/, service: this.excluded[2] },
      { pattern: /hvac|duct|air\s*con/, service: this.excluded[3] },
      { pattern: /solar\s*panel/, service: this.excluded[4] }
    ];

    for (const { pattern, service } of exclusionKeywords) {
      if (pattern.test(query)) {
        return service;
      }
    }

    return null;
  }

  _findBestMatch(query) {
    let bestMatch = { confidence: 0, service: null, variation: null };

    for (const service of this.services) {
      // Check keywords
      const keywordMatches = service.keywords.filter(kw => query.includes(kw));
      let confidence = keywordMatches.length / service.keywords.length;

      // Check exact name match
      if (query.includes(service.shortName.toLowerCase())) {
        confidence = Math.max(confidence, 0.9);
      }

      // Check variations
      let matchedVariation = null;
      for (const variation of service.variations) {
        if (query.includes(variation.toLowerCase())) {
          confidence = Math.max(confidence, 0.8);
          matchedVariation = variation;
          break;
        }
      }

      // Boost for multiple keyword matches
      if (keywordMatches.length >= 2) {
        confidence = Math.min(confidence * 1.3, 1);
      }

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          confidence,
          service,
          variation: matchedVariation
        };
      }
    }

    return bestMatch;
  }

  _isRoofingRelated(query) {
    const roofingKeywords = [
      'roof', 'tile', 'ridge', 'valley', 'gutter', 'leak',
      'bedding', 'pointing', 'coating', 'metal', 'colorbond'
    ];

    return roofingKeywords.some(kw => query.includes(kw));
  }
}

/**
 * Shared instance
 */
let sharedCanonicalServices = null;

export function getSharedCanonicalServices(config = {}) {
  if (!sharedCanonicalServices) {
    sharedCanonicalServices = new CanonicalServicesManager(config);
  }
  return sharedCanonicalServices;
}

export function resetSharedCanonicalServices() {
  sharedCanonicalServices = null;
}
