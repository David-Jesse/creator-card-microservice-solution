const validator = require('@app-core/validator');
const { throwAppError } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const CreatorCardRepository = require('@app/repository/creator-card');
const CreatorCardMessages = require('@app/messages/creator-card');
const helpers = require('./helpers');

const { CREATOR_CARD_ERROR_CODES: CODES } = CreatorCardMessages;

// Field-level validation handled by VSL: types, required fields, lengths, enums.
// Rules VSL cannot express (slug charset, http(s) url scheme, alphanumeric
// access_code, integer amounts, slug uniqueness, conditional access_code) are
// enforced below as business logic.
const spec = `root {
  title string<trim|lengthBetween:3,100>
  description? string<trim|maxLength:500>
  slug? string<lengthBetween:5,50>
  creator_reference string<length:20>
  links[]? {
    title string<trim|lengthBetween:1,100>
    url string<trim|maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[] {
      name string<trim|lengthBetween:3,100>
      description? string<trim|maxLength:250>
      amount number<min:1>
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string<length:6>
}`;

const parsedSpec = validator.parse(spec);

/**
 * Generate a slug from the title that is unique across all (non-deleted) cards.
 * @param {string} title
 * @returns {Promise<string>}
 */
async function generateUniqueSlug(title) {
  const base = helpers.slugifyTitle(title);

  let candidate;
  if (base.length >= helpers.SLUG_MIN_LENGTH && base.length <= helpers.SLUG_MAX_LENGTH) {
    candidate = base;
  } else {
    // too short (or too long) -> always carries a random suffix
    candidate = helpers.withRandomSuffix(base);
  }

  // Ensure the candidate is not already taken; regenerate with a fresh suffix
  // until it is unique.
  let isUnique = false;
  while (!isUnique) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await CreatorCardRepository.findOne({
      query: { slug: candidate, deleted: null },
    });

    if (!existing) {
      isUnique = true;
    } else {
      candidate = helpers.withRandomSuffix(base);
    }
  }

  return candidate;
}

/**
 * Create a Creator Card.
 * @param {Object} serviceData
 * @param {Object} [options]
 * @returns {Promise<Object>} serialized card (with access_code)
 */
async function createCreatorCard(serviceData, options = {}) {
  let response;

  // 1. Field-level validation (throws HTTP 400 on failure).
  const data = validator.validate(serviceData, parsedSpec);

  try {
    // 2. Field-shape rules the validator cannot express (all HTTP 400).
    if (Array.isArray(data.links)) {
      data.links.forEach((link) => {
        if (!helpers.isHttpUrl(link.url)) {
          throwAppError(CreatorCardMessages.INVALID_LINK_URL, CODES.VALIDATION);
        }
      });
    }

    if (data.service_rates && Array.isArray(data.service_rates.rates)) {
      data.service_rates.rates.forEach((rate) => {
        if (!helpers.isPositiveInteger(rate.amount)) {
          throwAppError(CreatorCardMessages.INVALID_RATE_AMOUNT, CODES.VALIDATION);
        }
      });
    }

    // 3. Conditional access_code business rules.
    const accessType = data.access_type || 'public';
    const hasAccessCode = typeof data.access_code !== 'undefined' && data.access_code !== null;

    if (accessType === 'private' && !hasAccessCode) {
      throwAppError(CreatorCardMessages.ACCESS_CODE_REQUIRED, CODES.AC01);
    }

    if (accessType !== 'private' && hasAccessCode) {
      throwAppError(CreatorCardMessages.ACCESS_CODE_NOT_ALLOWED, CODES.AC05);
    }

    if (hasAccessCode && !helpers.isAlphanumeric(data.access_code)) {
      throwAppError(CreatorCardMessages.INVALID_ACCESS_CODE_FORMAT, CODES.VALIDATION);
    }

    // 4. Slug handling: client-provided (validate charset + uniqueness) or
    //    auto-generated from the title.
    let slug;
    if (typeof data.slug !== 'undefined') {
      if (!helpers.isValidSlug(data.slug)) {
        throwAppError(CreatorCardMessages.INVALID_SLUG_FORMAT, CODES.VALIDATION);
      }

      const existing = await CreatorCardRepository.findOne({
        query: { slug: data.slug, deleted: null },
      });

      if (existing) {
        throwAppError(CreatorCardMessages.SLUG_TAKEN, CODES.SL02);
      }

      slug = data.slug;
    } else {
      slug = await generateUniqueSlug(data.title);
    }

    // 5. Persist (created/updated/_id are set by the repository layer).
    const toStore = {
      title: data.title,
      slug,
      creator_reference: data.creator_reference,
      links: Array.isArray(data.links) ? data.links : [],
      status: data.status,
      access_type: accessType,
      access_code: accessType === 'private' ? data.access_code : null,
      deleted: null,
    };

    if (typeof data.description !== 'undefined') {
      toStore.description = data.description;
    }

    if (data.service_rates) {
      toStore.service_rates = data.service_rates;
    }

    const created = await CreatorCardRepository.create(toStore, options);

    // 6. Serialize (creator sees access_code in the creation response).
    response = helpers.serializeCard(created, { includeAccessCode: true });
  } catch (error) {
    appLogger.errorX(error, 'create-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = createCreatorCard;
