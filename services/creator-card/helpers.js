const { randomBytes } = require('@app-core/randomness');

const SLUG_MAX_LENGTH = 50;
const SLUG_MIN_LENGTH = 5;
const SUFFIX_LENGTH = 6; // random alphanumeric suffix
const SUFFIX_WITH_SEP_LENGTH = SUFFIX_LENGTH + 1; // includes the leading '-'

function isLowerAlpha(ch) {
  return ch >= 'a' && ch <= 'z';
}

function isUpperAlpha(ch) {
  return ch >= 'A' && ch <= 'Z';
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isAlphaNumericChar(ch) {
  return isLowerAlpha(ch) || isUpperAlpha(ch) || isDigit(ch);
}

function isSlugChar(ch) {
  return isAlphaNumericChar(ch) || ch === '-' || ch === '_';
}

function isWhitespaceChar(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

/**
 * True when the string contains only letters, numbers, hyphens and underscores.
 * @param {string} value
 * @returns {boolean}
 */
function isValidSlug(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (!isSlugChar(value[i])) return false;
  }
  return true;
}

/**
 * True when the string contains only letters and numbers.
 * @param {string} value
 * @returns {boolean}
 */
function isAlphanumeric(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (!isAlphaNumericChar(value[i])) return false;
  }
  return true;
}

/**
 * True when the url begins with the http:// or https:// scheme.
 * @param {string} value
 * @returns {boolean}
 */
function isHttpUrl(value) {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

/**
 * True for positive integers (>= 1) - amounts are minor units, no decimals.
 * @param {number} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Turn a title into a base slug:
 *  1. lowercase
 *  2. whitespace -> hyphen
 *  3. drop any character that is not a letter, number, hyphen or underscore
 * @param {string} title
 * @returns {string}
 */
function slugifyTitle(title) {
  const lowered = title.toLowerCase();
  let out = '';
  for (let i = 0; i < lowered.length; i += 1) {
    const ch = lowered[i];
    if (isWhitespaceChar(ch)) {
      out += '-';
    } else if (isSlugChar(ch)) {
      out += ch;
    }
    // anything else is removed
  }
  return out;
}

/**
 * 6-character alphanumeric suffix using the codebase randomness helper.
 * @returns {string}
 */
function randomSlugSuffix() {
  return randomBytes(SUFFIX_LENGTH);
}

/**
 * Append a random suffix to a base, keeping the result within the slug length
 * ceiling.
 * @param {string} base
 * @returns {string}
 */
function withRandomSuffix(base) {
  const room = SLUG_MAX_LENGTH - SUFFIX_WITH_SEP_LENGTH;
  const trimmedBase = base.length > room ? base.slice(0, room) : base;
  return `${trimmedBase}-${randomSlugSuffix()}`;
}

/**
 * Serialize a stored Creator Card document into the public API shape.
 * - exposes `_id` as `id`
 * - normalises `deleted` to null when not set
 * - omits `access_code` entirely unless includeAccessCode is true
 * @param {Object} doc
 * @param {{ includeAccessCode?: boolean }} [opts]
 * @returns {Object}
 */
function serializeCard(doc, opts = {}) {
  const { includeAccessCode = false } = opts;
  const out = {};

  out.id = doc._id;
  out.title = doc.title;
  if (typeof doc.description !== 'undefined' && doc.description !== null) {
    out.description = doc.description;
  }
  out.slug = doc.slug;
  out.creator_reference = doc.creator_reference;
  out.links = Array.isArray(doc.links)
    ? doc.links.map((link) => ({ title: link.title, url: link.url }))
    : [];

  if (doc.service_rates && typeof doc.service_rates === 'object') {
    out.service_rates = {
      currency: doc.service_rates.currency,
      rates: Array.isArray(doc.service_rates.rates)
        ? doc.service_rates.rates.map((rate) => {
            const mapped = { name: rate.name };
            if (typeof rate.description !== 'undefined' && rate.description !== null) {
              mapped.description = rate.description;
            }
            mapped.amount = rate.amount;
            return mapped;
          })
        : [],
    };
  }

  out.status = doc.status;
  out.access_type = doc.access_type;

  if (includeAccessCode) {
    out.access_code =
      typeof doc.access_code === 'undefined' || doc.access_code === null ? null : doc.access_code;
  }

  out.created = doc.created;
  out.updated = doc.updated;
  out.deleted = typeof doc.deleted === 'undefined' || doc.deleted === null ? null : doc.deleted;

  return out;
}

module.exports = {
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  isValidSlug,
  isAlphanumeric,
  isHttpUrl,
  isPositiveInteger,
  slugifyTitle,
  withRandomSuffix,
  serializeCard,
};
