const { createHandler } = require('@app-core/server');
const createCreatorCard = require('@app/services/creator-card/create-creator-card');
const CreatorCardMessages = require('@app/messages/creator-card');

module.exports = createHandler({
  path: '/creator-cards',
  method: 'post',
  middlewares: [],
  async handler(rc, helpers) {
    const payload = { ...rc.body };

    const response = await createCreatorCard(payload);

    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: CreatorCardMessages.CARD_CREATED,
      data: response,
    };
  },
});
