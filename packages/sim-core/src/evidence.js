import { isJsonValue } from './json.js';

const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const statuses = new Set(['unknown', 'estimate', 'reference', 'verified']);
const methods = new Set(['official', 'measurement', 'cross-check']);

function webUrl(value) {
  if (!text(value)) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Checks evidence structure, not the truth or historical accuracy of the cited source. */
export function validateEvidence(record, expectedRuleset) {
  if (!object(record)) return ['record must be an object'];
  const errors = [];
  if (!text(record.id)) errors.push('id is required');
  if (!text(expectedRuleset) || !text(record.ruleset) || record.ruleset !== expectedRuleset) {
    errors.push('ruleset must match the explicit target');
  }
  if (!statuses.has(record.status)) errors.push('unknown status');
  if (Object.hasOwn(record, 'value')) {
    if (!isJsonValue(record.value)) errors.push('value must contain only JSON data');
  } else if (record.status !== 'unknown') errors.push('value is required');
  if (!Array.isArray(record.sources)) errors.push('sources must be an array');
  else {
    if (['reference', 'verified'].includes(record.status) && record.sources.length === 0) {
      errors.push('reference and verified values require sources');
    }
    for (const [index, source] of record.sources.entries()) {
      if (!object(source) || !webUrl(source.url) || !text(source.locator) || !text(source.revision)) {
        errors.push(`sources[${index}] requires a web URL, locator, and pinned revision`);
      }
    }
  }
  if (record.status === 'verified') {
    const audit = record.verification;
    if (!object(audit) || !methods.has(audit.method) || !isoDate(audit.reviewedAt) || !text(audit.notes)) {
      errors.push('verified values require an audit method, valid review date, and notes');
    }
  }
  return errors;
}
