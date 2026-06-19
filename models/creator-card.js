const { ModelSchema, SchemaTypes, DatabaseModel } = require('@app-core/mongoose');

const modelName = 'creator_cards';

/**
 * @typedef {Object} CreatorCardSchema
 * @property {String} _id - ULID, serialized as `id` in API responses
 * @property {String} title
 * @property {String} description
 * @property {String} slug - unique public identifier (uniqueness enforced in service)
 * @property {String} creator_reference
 * @property {Array} links - [{ title, url }]
 * @property {Object} service_rates - { currency, rates: [{ name, description, amount }] }
 * @property {String} status - draft | published
 * @property {String} access_type - public | private
 * @property {String} access_code - 6 alphanumeric chars for private cards, else null
 * @property {Number} created - unix epoch millis (set by repository on create)
 * @property {Number} updated - unix epoch millis (set by repository on create)
 * @property {Number} deleted - unix epoch millis once soft-deleted, else null
 */

// Per the codebase convention, models hold only DB-level concerns (types,
// indexes, defaults). All field validation lives in the service layer (VSL),
// so we deliberately avoid `required`/`enum`/length constraints here.
const schemaConfig = {
  _id: { type: SchemaTypes.ULID },
  title: { type: SchemaTypes.String },
  description: { type: SchemaTypes.String },
  slug: { type: SchemaTypes.String, index: true },
  creator_reference: { type: SchemaTypes.String, index: true },
  links: { type: SchemaTypes.Array, default: [] },
  service_rates: { type: SchemaTypes.Mixed },
  status: { type: SchemaTypes.String, index: true },
  access_type: { type: SchemaTypes.String, default: 'public' },
  access_code: { type: SchemaTypes.String, default: null },
  created: { type: SchemaTypes.Number },
  updated: { type: SchemaTypes.Number },
  deleted: { type: SchemaTypes.Number, default: null, index: true },
};

const modelSchema = new ModelSchema(schemaConfig, { collection: modelName });

// Soft-deletion is managed explicitly in the service (so `deleted` defaults to
// null, not 0 as the paranoid helper would set it), hence no { paranoid: true }.
/** @type {CreatorCardSchema} */
module.exports = DatabaseModel.model(modelName, modelSchema);
