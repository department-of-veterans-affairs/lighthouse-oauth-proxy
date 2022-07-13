const { hashString, launchValidation } = require("../../../utils");
const { getUnixTime } = require("date-fns");

class SaveDocumentLaunchStrategy {
  constructor(logger, dynamoClient, config) {
    this.logger = logger;
    this.dynamoClient = dynamoClient;
    this.config = config;
  }
  async saveDocumentToDynamo(document, tokens) {
    let launch;
    if (document.launch) {
      launch = document.launch;
      if (
        !tokens.scope.split(" ").includes("launch/patient") &&
        !launchValidation(launch)
      ) {
        throw {
          status: 400,
          error: "invalid_request",
          error_description: "The provided patient launch must be a string",
        };
      }
    }
    try {
      let accessToken = hashString(
        tokens.access_token,
        this.config.hmac_secret
      );
      let payload = {
        access_token: accessToken,
        launch: launch,
        expires_on: getUnixTime(new Date()) + tokens.expires_in,
      };
      await this.dynamoClient.savePayloadToDynamo(
        payload,
        this.config.dynamo_launch_context_table
      );
    } catch (error) {
      this.logger.error(
        "Could not update the access token token in DynamoDB",
        error
      );
    }
  }
}

module.exports = { SaveDocumentLaunchStrategy };
