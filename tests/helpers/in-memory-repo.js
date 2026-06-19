/**
 * In-memory stand-in for @app/repository/creator-card used for offline testing
 * (this sandbox cannot reach MongoDB Atlas). It mirrors the real repository's
 * observable behaviour:
 *  - create() assigns a ULID _id and created/updated timestamps
 *  - findOne() returns a lean *copy* (never a live reference), and matches the
 *    { slug, deleted: null } query shape the services use
 *  - raw().updateOne() applies a $set against the backing store
 */
const { ulid } = require('@app-core/randomness');

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeRepoStub() {
  const store = [];

  function matches(doc, query) {
    return Object.keys(query).every((key) => {
      const expected = query[key];
      if (expected === null) {
        return doc[key] === null || typeof doc[key] === 'undefined';
      }
      return doc[key] === expected;
    });
  }

  const repo = {
    async findOne({ query }) {
      const found = store.find((doc) => matches(doc, query));
      return found ? deepCopy(found) : null;
    },

    async create(data) {
      const now = Date.now();
      const doc = { ...deepCopy(data) };
      doc._id = ulid();
      doc.created = now;
      doc.updated = now;
      if (typeof doc.deleted === 'undefined') doc.deleted = null;
      store.push(doc);
      return deepCopy(doc);
    },

    raw() {
      return {
        async updateOne(filter, update) {
          const target = store.find((doc) => matches(doc, filter));
          if (!target) return { acknowledged: true, modifiedCount: 0 };
          const set = (update && update.$set) || {};
          Object.assign(target, set);
          return { acknowledged: true, modifiedCount: 1 };
        },
      };
    },

    // test helpers
    __store: store,
  };

  return repo;
}

module.exports = makeRepoStub;
