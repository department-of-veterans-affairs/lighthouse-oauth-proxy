const { rethrowIfRuntimeError } = require("../../../utils");

class GetDocumentByAccessTokenStrategy {
  constructor(logger, dynamoClient, config) {
    this.logger = logger;
    this.dynamoClient = dynamoClient;
    this.config = config;
  }
  async getDocument(access_token, dynamo_table) {
    let document;

    try {
      let payload = await this.dynamoClient.getPayloadFromDynamo(
        {
          access_token: access_token,
        },
        dynamo_table
      );
      if (payload.Item) {
        document = payload.Item;
      }
    } catch (err) {
      rethrowIfRuntimeError(err);
      this.logger.error("Failed to retrieve document from Dynamo DB.", err);
    }

    return document;
  }
}

module.exports = { GetDocumentByAccessTokenStrategy };
