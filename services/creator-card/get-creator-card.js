const validator = require('@app-core/validator');
const { throwAppError } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const CreatorCardRepository = require('@app/repository/creator-card');
const CreatorCardMessages = require('@app/messages/creator-card');
const helpers = require('./helpers');

const { CREATOR_CARD_ERROR_CODES: CODES } = CreatorCardMessages;

const spec = `root {
  slug string<trim|minLength:1>
  access_code? any
}`;

const parsedSpec = validator.parse(spec);

/**
 * Retrieve a Creator Card by slug for the public, shareable endpoint.
 *
 * Access rules are applied strictly in this order:
 *   1. no card with that slug (or it was deleted) -> NF01 (404)
 *   2. card is a draft                            -> NF02 (404)
 *   3. private card, no access_code supplied       -> AC03 (403)
 *   4. private card, wrong access_code             -> AC04 (403)
 *   otherwise                                      -> the card (200)
 *
 * @param {Object} serviceData - { slug, access_code? }
 * @returns {Promise<Object>} serialized card (access_code omitted)
 */
async function getCreatorCard(serviceData) {
  let response;

  const data = validator.validate(serviceData, parsedSpec);

  try {
    // deleted cards have a non-null `deleted`, so this also yields NF01 for them.
    const card = await CreatorCardRepository.findOne({
      query: { slug: data.slug, deleted: null },
    });

    if (!card) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, CODES.NF01);
    }

    if (card.status === 'draft') {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, CODES.NF02);
    }

    if (card.access_type === 'private') {
      const providedCode = data.access_code;
      const codeSupplied = typeof providedCode !== 'undefined' && providedCode !== null;

      if (!codeSupplied) {
        throwAppError(CreatorCardMessages.CARD_IS_PRIVATE, CODES.AC03);
      }

      if (String(providedCode) !== String(card.access_code)) {
        throwAppError(CreatorCardMessages.INVALID_ACCESS_CODE, CODES.AC04);
      }
    }

    // access_code is never exposed on the public retrieval endpoint.
    response = helpers.serializeCard(card, { includeAccessCode: false });
  } catch (error) {
    appLogger.errorX(error, 'get-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = getCreatorCard;
