/**
 * Shared physiotherapy / rehabilitation outcome measure catalog.
 * Source of truth: ./outcomeMeasures.catalog.json
 */

import catalog from './outcomeMeasures.catalog.json';

export const OUTCOME_MEASURE_CATALOG_VERSION = catalog.version;
export const OUTCOME_MEASURE_CATEGORIES = catalog.categories;
export const OUTCOME_MEASURES = catalog.measures;

/** @param {string} code */
export function getOutcomeMeasureByCode(code) {
  const c = String(code || '').trim();
  return OUTCOME_MEASURES.find((m) => m.code === c) ?? null;
}

/** @param {string} code */
export function isKnownOutcomeInstrument(code) {
  return getOutcomeMeasureByCode(code) != null;
}

/** @param {number} catIndex */
export function getOutcomeMeasuresByCategory(catIndex) {
  return OUTCOME_MEASURES.filter((m) => m.cat === catIndex);
}
