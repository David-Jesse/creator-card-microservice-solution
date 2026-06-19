/**
 * Custom business-rule error codes for the Creator Card service.
 *
 * Field-level validation (types, required, lengths, enums) is handled by the
 * VSL validator and surfaces as HTTP 400 via the `SPCL_VALIDATION` code.
 *
 * The codes below are the business rules the validator cannot express. Each is
 * mapped to its HTTP status in `core/errors/constants.js`
 * (ERROR_STATUS_CODE_MAPPING) and is surfaced as the top-level `code` field in
 * the error response body.
 */
const CREATOR_CARD_ERROR_CODES = {
  SL02: 'SL02', // 400 - slug already taken
  AC01: 'AC01', // 400 - access_code required when access_type is private
  AC05: 'AC05', // 400 - access_code not allowed on public cards
  NF01: 'NF01', // 404 - card with the given slug does not exist (or was deleted)
  NF02: 'NF02', // 404 - card exists but is a draft
  AC03: 'AC03', // 403 - access code required to view private card
  AC04: 'AC04', // 403 - invalid access code
  // Field-shape rules VSL cannot express (slug charset, url scheme, alphanumeric
  // access_code, integer amounts). These are still field-level validation, so
  // they return HTTP 400 like the framework validator.
  VALIDATION: 'VALIDATION_ERROR',
};

const CreatorCardMessages = {
  // Success messages
  CARD_CREATED: 'Creator Card Created Successfully.',
  CARD_RETRIEVED: 'Creator Card Retrieved Successfully.',
  CARD_DELETED: 'Creator Card Deleted Successfully.',

  // Business-rule error messages
  SLUG_TAKEN: 'Slug is already taken',
  ACCESS_CODE_REQUIRED: 'access_code is required when access_type is private',
  ACCESS_CODE_NOT_ALLOWED: 'access_code can only be set on private cards',
  CARD_NOT_FOUND: 'Creator card not found',
  CARD_IS_PRIVATE: 'This card is private. An access code is required',
  INVALID_ACCESS_CODE: 'Invalid access code',

  // Field-shape error messages (HTTP 400)
  INVALID_SLUG_FORMAT: 'slug may only contain letters, numbers, hyphens and underscores',
  INVALID_ACCESS_CODE_FORMAT: 'access_code must be exactly 6 alphanumeric characters',
  INVALID_LINK_URL: 'Each link url must start with http:// or https://',
  INVALID_RATE_AMOUNT:
    'Each service rate amount must be a positive integer expressed in minor units',

  CREATOR_CARD_ERROR_CODES,
};

module.exports = CreatorCardMessages;
