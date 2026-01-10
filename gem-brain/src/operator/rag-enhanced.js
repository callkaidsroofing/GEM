/**
 * CKR-GEM Enhanced RAG System
 *
 * Implements the High Council "3-Pass RAG Retrieval" pattern:
 * - Pass 1: Intent + Object (what is the user trying to do?)
 * - Pass 2: Brand + Voice (how should CKR respond?)
 * - Pass 3: SOP + Templates (what procedures apply?)
 *
 * Features:
 * - Citation format [RAG:<path>#ref]
 * - Canonical services check
 * - "No CKR source found" fallback
 * - Knowledge base integration (doctrine files)
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { OperatorRAG, getSharedRAG } from './rag.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_BASE_DIR = join(__dirname, '../../.knowledge');

/**
 * RAG citation reference
 */
export class RAGCitation {
  constructor(path, ref, content = null) {
    this.path = path;
    this.ref = ref;
    this.content = content;
    this.timestamp = new Date().toISOString();
  }

  toString() {
    return `[RAG:${this.path}#${this.ref}]`;
  }

  toJSON() {
    return {
      citation: this.toString(),
      path: this.path,
      ref: this.ref,
      content: this.content?.slice(0, 200),
      timestamp: this.timestamp
    };
  }
}

/**
 * Enhanced RAG Manager with 3-pass retrieval
 */
export class EnhancedRAG extends OperatorRAG {
  constructor(config = {}) {
    super(config);

    this.knowledgeBaseDir = config.knowledgeBaseDir || KNOWLEDGE_BASE_DIR;
    this.enableCitations = config.enableCitations !== false;
    this.enable3Pass = config.enable3Pass !== false;

    // Load knowledge base documents
    this.knowledgeBase = {
      doctrine: null,
      sops: [],
      templates: []
    };

    this._loadKnowledgeBase();
  }

  /**
   * 3-Pass RAG Retrieval
   *
   * @param {string} message - User message
   * @param {object} context - Execution context
   * @returns {Promise<EnhancedRAGResults>}
   */
  async threePassRetrieval(message, context = {}) {
    const results = {
      // Base RAG results
      leads: [],
      tasks: [],
      jobs: [],
      quotes: [],
      inspections: [],
      notes: [],
      recent_activity: [],

      // Enhanced results
      pass1_intent: null,
      pass2_brand: null,
      pass3_sop: null,
      citations: [],
      canonical_service: null,
      confidence: 0
    };

    try {
      // Run base RAG query
      const baseResults = await super.query(message, context);
      Object.assign(results, baseResults);

      if (!this.enable3Pass) {
        return results;
      }

      // PASS 1: Intent + Object
      console.log('[RAG Pass 1: Intent]');
      results.pass1_intent = await this._pass1Intent(message, context);

      // PASS 2: Brand + Voice
      console.log('[RAG Pass 2: Brand]');
      results.pass2_brand = this._pass2Brand(message, results.pass1_intent);

      // PASS 3: SOP + Templates
      console.log('[RAG Pass 3: SOP]');
      results.pass3_sop = this._pass3SOP(message, results.pass1_intent);

      // Check canonical services
      results.canonical_service = this._checkCanonicalService(message);

      // Calculate overall confidence
      results.confidence = this._calculateConfidence(results);

      return results;
    } catch (error) {
      console.warn('[EnhancedRAG] 3-pass retrieval failed:', error.message);
      return results;
    }
  }

  /**
   * Pass 1: Intent + Object Recognition
   */
  async _pass1Intent(message, context) {
    const lowerMsg = message.toLowerCase();

    // Detect intent categories
    const intents = {
      inspection: /inspect|check|look at|assess|report|condition/.test(lowerMsg),
      quote: /quote|estimate|price|cost|how much/.test(lowerMsg),
      restoration: /restor|repair|fix|rebedd|repoint|paint|coat/.test(lowerMsg),
      cleaning: /clean|wash|pressure|moss|lichen/.test(lowerMsg),
      leak: /leak|drip|water|ceiling|stain/.test(lowerMsg),
      valley: /valley|valleys|valley iron/.test(lowerMsg),
      gutter: /gutter|gutters|downpipe/.test(lowerMsg),
      ridgecap: /ridge|ridg|cap|capping|bedding|pointing/.test(lowerMsg),
      reroof: /re-?roof|new roof|replace roof/.test(lowerMsg),
      tile: /tile|tiles|broken tile|cracked tile/.test(lowerMsg),
      communication: /sms|email|call|message|contact/.test(lowerMsg),
      scheduling: /schedul|book|appointment|available/.test(lowerMsg),
      followup: /follow.?up|chase|remind|call back/.test(lowerMsg)
    };

    // Find dominant intent
    const dominantIntent = Object.entries(intents)
      .filter(([, v]) => v)
      .map(([k]) => k);

    // Extract objects (names, locations, etc.)
    const objects = {
      suburb: this._extractSuburb(message),
      phone: message.match(/0\d{9}/)?.[0],
      name: message.match(/(?:for|from|named?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)?.[1],
      roofType: this._extractRoofType(message)
    };

    return {
      intents: dominantIntent,
      primary_intent: dominantIntent[0] || 'general',
      objects,
      citations: this._generateIntentCitations(dominantIntent)
    };
  }

  /**
   * Pass 2: Brand + Voice Guidelines
   */
  _pass2Brand(message, intentResult) {
    if (!this.knowledgeBase.doctrine) {
      return {
        guidelines: [],
        tone: 'professional',
        citation: null
      };
    }

    const doctrine = this.knowledgeBase.doctrine;
    const brandDoctrine = doctrine.brand_doctrine || [];
    const inspectionDoctrine = doctrine.inspection_doctrine || [];

    // Select relevant guidelines based on intent
    let guidelines = [...brandDoctrine];
    let specificDoctrine = [];

    if (intentResult?.intents?.includes('inspection')) {
      specificDoctrine = inspectionDoctrine;
    }

    // Extract objection responses if relevant
    const objections = this._findRelevantObjections(message);

    const citation = new RAGCitation(
      'doctrine/CKR_MARKETING_DOCTRINE.json',
      'brand_doctrine',
      brandDoctrine.join('; ')
    );

    return {
      guidelines,
      specificDoctrine,
      objections,
      tone: 'professional',
      business: doctrine.business,
      citation: this.enableCitations ? citation : null
    };
  }

  /**
   * Pass 3: SOP + Templates
   */
  _pass3SOP(message, intentResult) {
    if (!this.knowledgeBase.doctrine) {
      return {
        procedures: [],
        templates: [],
        lockedSequences: [],
        citation: null
      };
    }

    const doctrine = this.knowledgeBase.doctrine;
    const primaryIntent = intentResult?.primary_intent;

    // Find relevant service SOPs
    const relevantService = this._findRelevantService(message, primaryIntent);

    let procedures = [];
    let lockedSequences = [];

    if (relevantService) {
      // Extract procedures from service definition
      if (relevantService.proof_captured_on_site) {
        procedures.push({
          type: 'photo_requirements',
          items: relevantService.proof_captured_on_site.photos_minimum || []
        });
        procedures.push({
          type: 'notes_requirements',
          items: relevantService.proof_captured_on_site.notes_minimum || []
        });
      }

      // Extract locked sequences
      if (relevantService.locked_restoration_sequence_for_tiled_roofs) {
        lockedSequences = relevantService.locked_restoration_sequence_for_tiled_roofs;
      }
    }

    // Global locked sequences
    if (doctrine.locked_sequences?.tiled_restoration) {
      lockedSequences = doctrine.locked_sequences.tiled_restoration;
    }

    const citation = relevantService
      ? new RAGCitation(
          'doctrine/CKR_MARKETING_DOCTRINE.json',
          `services/${relevantService.canonical_service_name}`,
          relevantService.canonical_service_name
        )
      : null;

    return {
      service: relevantService,
      procedures,
      lockedSequences,
      exclusions: relevantService?.exclusions_and_referral_boundaries || [],
      citation: this.enableCitations ? citation : null
    };
  }

  /**
   * Check if query matches a canonical service
   */
  _checkCanonicalService(message) {
    if (!this.knowledgeBase.doctrine?.services) {
      return { valid: false, fallback: 'No CKR source found' };
    }

    const services = this.knowledgeBase.doctrine.services;
    const lowerMsg = message.toLowerCase();

    for (const service of services) {
      const serviceName = service.canonical_service_name.toLowerCase();
      const variations = (service.variations || []).map(v => v.toLowerCase());

      // Check canonical name
      if (this._fuzzyMatch(lowerMsg, serviceName)) {
        return {
          valid: true,
          service: service.canonical_service_name,
          citation: new RAGCitation(
            'doctrine/CKR_MARKETING_DOCTRINE.json',
            `services/${service.canonical_service_name}`,
            service.canonical_service_name
          )
        };
      }

      // Check variations
      for (const variation of variations) {
        if (this._fuzzyMatch(lowerMsg, variation)) {
          return {
            valid: true,
            service: service.canonical_service_name,
            variation,
            citation: new RAGCitation(
              'doctrine/CKR_MARKETING_DOCTRINE.json',
              `services/${service.canonical_service_name}/${variation}`,
              variation
            )
          };
        }
      }
    }

    // Check for service-related keywords without exact match
    const serviceKeywords = [
      'inspection', 'restoration', 'painting', 'cleaning',
      'ridge', 'valley', 'gutter', 'leak', 'tile', 'reroof'
    ];

    const hasServiceKeyword = serviceKeywords.some(kw => lowerMsg.includes(kw));

    if (hasServiceKeyword) {
      return {
        valid: false,
        fallback: 'No exact CKR service match found',
        suggestion: 'Please specify the service type more clearly'
      };
    }

    return {
      valid: false,
      fallback: 'No CKR source found'
    };
  }

  /**
   * Build enhanced context block with citations
   */
  buildEnhancedContextBlock(ragResults) {
    const lines = [];

    // Base context
    const baseContext = super.buildContextBlock(ragResults);
    if (baseContext) {
      lines.push(baseContext);
    }

    // Brand guidelines
    if (ragResults.pass2_brand?.guidelines?.length > 0) {
      lines.push('\nBRAND GUIDELINES:');
      ragResults.pass2_brand.guidelines.slice(0, 3).forEach(g => {
        lines.push(`  - ${g}`);
      });
      if (ragResults.pass2_brand.citation) {
        lines.push(`  ${ragResults.pass2_brand.citation.toString()}`);
      }
    }

    // SOP procedures
    if (ragResults.pass3_sop?.service) {
      lines.push(`\nRELEVANT SERVICE: ${ragResults.pass3_sop.service.canonical_service_name}`);

      if (ragResults.pass3_sop.lockedSequences?.length > 0) {
        lines.push('LOCKED SEQUENCE:');
        ragResults.pass3_sop.lockedSequences.forEach((step, i) => {
          lines.push(`  ${i + 1}. ${step}`);
        });
      }

      if (ragResults.pass3_sop.citation) {
        lines.push(`  ${ragResults.pass3_sop.citation.toString()}`);
      }
    }

    // Canonical service check
    if (ragResults.canonical_service) {
      if (ragResults.canonical_service.valid) {
        lines.push(`\nCANONICAL SERVICE: ${ragResults.canonical_service.service}`);
      } else {
        lines.push(`\nSERVICE CHECK: ${ragResults.canonical_service.fallback}`);
      }
    }

    // Objection responses if available
    if (ragResults.pass2_brand?.objections?.length > 0) {
      lines.push('\nRELEVANT RESPONSES:');
      ragResults.pass2_brand.objections.forEach(o => {
        lines.push(`  Q: "${o.objection}"`);
        lines.push(`  A: "${o.response}"`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Generate all citations from results
   */
  collectCitations(ragResults) {
    const citations = [];

    if (ragResults.pass1_intent?.citations) {
      citations.push(...ragResults.pass1_intent.citations);
    }
    if (ragResults.pass2_brand?.citation) {
      citations.push(ragResults.pass2_brand.citation);
    }
    if (ragResults.pass3_sop?.citation) {
      citations.push(ragResults.pass3_sop.citation);
    }
    if (ragResults.canonical_service?.citation) {
      citations.push(ragResults.canonical_service.citation);
    }

    return citations;
  }

  // Private helpers

  _loadKnowledgeBase() {
    try {
      // Load doctrine
      const doctrinePath = join(this.knowledgeBaseDir, 'doctrine/CKR_MARKETING_DOCTRINE.json');
      if (existsSync(doctrinePath)) {
        this.knowledgeBase.doctrine = JSON.parse(readFileSync(doctrinePath, 'utf8'));
        console.log('[EnhancedRAG] Loaded marketing doctrine');
      }

      // Load SOPs from sops directory
      const sopsDir = join(this.knowledgeBaseDir, 'sops');
      if (existsSync(sopsDir)) {
        const sopFiles = readdirSync(sopsDir).filter(f => f.endsWith('.json'));
        this.knowledgeBase.sops = sopFiles.map(f => {
          try {
            return JSON.parse(readFileSync(join(sopsDir, f), 'utf8'));
          } catch (e) {
            return null;
          }
        }).filter(Boolean);
        console.log(`[EnhancedRAG] Loaded ${this.knowledgeBase.sops.length} SOPs`);
      }

      // Load templates
      const templatesDir = join(this.knowledgeBaseDir, 'templates');
      if (existsSync(templatesDir)) {
        const templateFiles = readdirSync(templatesDir).filter(f => f.endsWith('.json'));
        this.knowledgeBase.templates = templateFiles.map(f => {
          try {
            return JSON.parse(readFileSync(join(templatesDir, f), 'utf8'));
          } catch (e) {
            return null;
          }
        }).filter(Boolean);
        console.log(`[EnhancedRAG] Loaded ${this.knowledgeBase.templates.length} templates`);
      }
    } catch (error) {
      console.warn('[EnhancedRAG] Knowledge base loading failed:', error.message);
    }
  }

  _extractSuburb(message) {
    // Common SE Melbourne suburbs
    const suburbs = [
      'clyde north', 'clyde', 'cranbourne', 'berwick', 'narre warren',
      'dandenong', 'pakenham', 'officer', 'hallam', 'endeavour hills',
      'frankston', 'mornington', 'chelsea', 'clayton', 'springvale',
      'noble park', 'keysborough', 'rowville', 'scoresby', 'ferntree gully'
    ];

    const lowerMsg = message.toLowerCase();
    for (const suburb of suburbs) {
      if (lowerMsg.includes(suburb)) {
        return suburb.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }

    return null;
  }

  _extractRoofType(message) {
    const lowerMsg = message.toLowerCase();

    if (/concrete\s*tile/.test(lowerMsg)) return 'concrete_tile';
    if (/terracotta/.test(lowerMsg)) return 'terracotta_tile';
    if (/colorbond|colour\s*bond|metal\s*roof/.test(lowerMsg)) return 'metal_colorbond';
    if (/zincalume/.test(lowerMsg)) return 'metal_zincalume';
    if (/tile/.test(lowerMsg)) return 'tile_generic';
    if (/metal/.test(lowerMsg)) return 'metal_generic';

    return null;
  }

  _findRelevantService(message, intent) {
    if (!this.knowledgeBase.doctrine?.services) return null;

    const services = this.knowledgeBase.doctrine.services;
    const lowerMsg = message.toLowerCase();

    // Map intents to services
    const intentServiceMap = {
      inspection: 'Roof Health Check',
      restoration: 'Roof Restorations',
      cleaning: 'High-Pressure Washing',
      leak: 'Roof Health Check',
      ridgecap: 'Ridge Capping',
      valley: 'Valley Iron',
      gutter: 'Gutter',
      tile: 'Broken Tile'
    };

    const targetName = intentServiceMap[intent];
    if (targetName) {
      const service = services.find(s =>
        s.canonical_service_name.toLowerCase().includes(targetName.toLowerCase())
      );
      if (service) return service;
    }

    // Fallback: search by message content
    for (const service of services) {
      if (lowerMsg.includes(service.canonical_service_name.toLowerCase().split(' ')[0])) {
        return service;
      }
    }

    return null;
  }

  _findRelevantObjections(message) {
    if (!this.knowledgeBase.doctrine?.services) return [];

    const lowerMsg = message.toLowerCase();
    const objections = [];

    for (const service of this.knowledgeBase.doctrine.services) {
      const serviceObjections = service.common_objections_and_responses || [];
      for (const obj of serviceObjections) {
        // Check if message contains similar objection keywords
        const objKeywords = obj.objection.toLowerCase().split(/\s+/);
        const matches = objKeywords.filter(kw => lowerMsg.includes(kw) && kw.length > 3);
        if (matches.length >= 2) {
          objections.push(obj);
        }
      }
    }

    return objections.slice(0, 3);
  }

  _generateIntentCitations(intents) {
    if (!this.enableCitations) return [];

    return intents.map(intent =>
      new RAGCitation('system/intent_classification', intent, `Detected intent: ${intent}`)
    );
  }

  _fuzzyMatch(text, pattern) {
    // Simple fuzzy matching - check if key words from pattern appear in text
    const words = pattern.split(/\s+/).filter(w => w.length > 3);
    const matches = words.filter(w => text.includes(w));
    return matches.length >= Math.ceil(words.length * 0.6);
  }

  _calculateConfidence(results) {
    let confidence = 0;

    // Base confidence from database results
    if (results.leads.length > 0) confidence += 0.2;
    if (results.tasks.length > 0) confidence += 0.1;

    // Intent detection
    if (results.pass1_intent?.intents?.length > 0) confidence += 0.2;

    // Brand context
    if (results.pass2_brand?.guidelines?.length > 0) confidence += 0.2;

    // SOP match
    if (results.pass3_sop?.service) confidence += 0.2;

    // Canonical service
    if (results.canonical_service?.valid) confidence += 0.1;

    return Math.min(confidence, 1);
  }
}

/**
 * Shared enhanced RAG instance
 */
let sharedEnhancedRAG = null;

export function getSharedEnhancedRAG(config = {}) {
  if (!sharedEnhancedRAG) {
    sharedEnhancedRAG = new EnhancedRAG(config);
  }
  return sharedEnhancedRAG;
}

export function resetSharedEnhancedRAG() {
  sharedEnhancedRAG = null;
}
