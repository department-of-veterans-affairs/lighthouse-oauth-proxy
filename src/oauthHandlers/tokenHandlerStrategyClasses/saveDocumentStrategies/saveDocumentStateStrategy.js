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
    refreshTokenLifeCycleHistogram,
    temp_client_id
  ) {
    this.req = req;
    this.logger = logger;
    this.dynamoClient = dynamoClient;
    this.config = config;
    this.issuer = issuer;
    this.refreshTokenLifeCycleHistogram = refreshTokenLifeCycleHistogram;
    this.temp_client_id = temp_client_id;
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
          issued_on: getUnixTime(Date.now()),
        };

        /*
         * Legacy records may not have a client_id. This back-fills those records.
         * This logic can be removed once all records are updated (~42 days from
         * commit/release).
         *
         * "New" records get this set at authorization.
         */
        document.client_id = this.temp_client_id;
        updated_document.client_id = document.client_id;

        if (tokens.refresh_token) {
          updated_document.refresh_token = hashString(
            tokens.refresh_token,
            this.config.hmac_secret
          );

          /*
           * If replacing a refresh token, record metrics about its usage.
           *
           * Legacy records may not have an issued_on value. Assume these to be
           * issued 42 days prior to its expiration. This logic can be removed
           * once all documents are updated (~42 days from commit/release).
           *
           * Note this number is intentionally hardcoded to not change when the
           * config.refresh_token_ttl value is updated.
           */
          if (document.refresh_token) {
            let issued_on = fromUnixTime(document.issued_on);
            if (!document.issued_on) {
              issued_on = subDays(fromUnixTime(document.expires_on), 42);
            }

            this.refreshTokenLifeCycleHistogram
              .labels({ client_id: document.client_id })
              .observe(differenceInDays(Date.now(), issued_on));
          }

          /*
           * Set expiration date.
           *
           * If a refresh token was issued, expiration should match refresh token TTL.
           * If only an access token was issued, expiration should match access token TTL.
           */
          let expires_on = addDays(
            fromUnixTime(updated_document.issued_on),
            this.config.refresh_token_ttl
          );
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
