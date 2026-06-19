const { createHandler } = require('@app-core/server');
const deleteCreatorCard = require('@app/services/creator-card/delete-creator-card');
const CreatorCardMessages = require('@app/messages/creator-card');

module.exports = createHandler({
  path: '/creator-cards/:slug',
  method: 'delete',
  middlewares: [],
  async handler(rc, helpers) {
    const payload = {
      slug: rc.params.slug,
      ...(rc.body || {}),
    };

    const response = await deleteCreatorCard(payload);

    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: CreatorCardMessages.CARD_DELETED,
      data: response,
    };
  },
});
