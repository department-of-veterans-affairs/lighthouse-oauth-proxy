const { hashString } = require("../../../utils");
const {
  addDays,
  getUnixTime,
  subDays,
  fromUnixTime,
  differenceInDays,
} = require("date-fns");

class SaveDocumentStateStrategy {
  constructor(
    req,
    logger,
    dynamoClient,
    config,
    issuer,
    refreshTokenLifeCycleHistogram
  ) {
    this.req = req;
    this.logger = logger;
    this.dynamoClient = dynamoClient;
    this.config = config;
    this.issuer = issuer;
    this.refreshTokenLifeCycleHistogram = refreshTokenLifeCycleHistogram;
  }
  async saveDocumentToDynamo(document, tokens) {
    try {
      if (document.state && tokens.access_token) {
        let updated_document = {
          access_token: hashString(
            tokens.access_token,
            this.config.hmac_secret
          ),
          iss: this.issuer,
        };

        if (tokens.refresh_token) {
          updated_document.refresh_token = hashString(
            tokens.refresh_token,
            this.config.hmac_secret
          );
          let now = new Date();
          if (document.refresh_token) {
            let created_at = subDays(fromUnixTime(document.expires_on), 42);
            this.refreshTokenLifeCycleHistogram.observe(
              differenceInDays(now, created_at)
            );
          }
          let expires_on = addDays(now, 42);
          updated_document.expires_on = getUnixTime(expires_on);
        } else {
          updated_document.expires_on = tokens.expires_at;
        }

        await this.dynamoClient.updateToDynamo(
          { internal_state: document.internal_state },
          updated_document,
          this.config.dynamo_oauth_requests_table
        );
      }
    } catch (error) {
      this.logger.error(
        "Could not update the refresh token in DynamoDB",
        error
      );
    }

    try {
      if (document.launch && tokens.access_token) {
        if (tokens.scope && tokens.scope.split(" ").includes("launch")) {
          let launch = document.launch;
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
        } else {
          this.logger.warn("Launch context specified but scope not granted.");
        }
      }
    } catch (error) {
      this.logger.error("Could not save the launch context in DynamoDB", error);
      throw {
        status: 500,
        errorMessage: "Could not save the launch context.",
      };
    }
  }
}

module.exports = { SaveDocumentStateStrategy };
