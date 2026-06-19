const validator = require('@app-core/validator');
const { throwAppError } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const CreatorCardRepository = require('@app/repository/creator-card');
const CreatorCardMessages = require('@app/messages/creator-card');
const helpers = require('./helpers');

const { CREATOR_CARD_ERROR_CODES: CODES } = CreatorCardMessages;

// creator_reference is required by the spec's delete contract (exactly 20
// chars). The spec lists no ownership/mismatch error for delete, so the field
// is validated for shape only and not matched against the stored value.
const spec = `root {
  slug string<trim|minLength:1>
  creator_reference string<length:20>
}`;

const parsedSpec = validator.parse(spec);

/**
 * Soft-delete a Creator Card by slug.
 *  - unknown / already-deleted slug -> NF01 (404)
 *  - otherwise sets `deleted` and returns the deleted card in the creation
 *    response shape (with access_code).
 *
 * @param {Object} serviceData - { slug, creator_reference }
 * @returns {Promise<Object>} serialized deleted card (with access_code)
 */
async function deleteCreatorCard(serviceData) {
  let response;

  const data = validator.validate(serviceData, parsedSpec);

  try {
    const card = await CreatorCardRepository.findOne({
      query: { slug: data.slug, deleted: null },
    });

    if (!card) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, CODES.NF01);
    }

    const deletedAt = Date.now();

    // Set only `deleted` (the `updated` timestamp is intentionally left
    // untouched), so we go through the raw model rather than the repository's
    // updateOne (which always bumps `updated`).
    const Model = CreatorCardRepository.raw();
    await Model.updateOne({ _id: card._id }, { $set: { deleted: deletedAt } });

    card.deleted = deletedAt;

    response = helpers.serializeCard(card, { includeAccessCode: true });
  } catch (error) {
    appLogger.errorX(error, 'delete-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = deleteCreatorCard;
