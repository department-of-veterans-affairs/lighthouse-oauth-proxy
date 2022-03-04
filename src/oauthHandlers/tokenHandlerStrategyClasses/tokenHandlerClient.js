const {
  rethrowIfRuntimeError,
  hashString,
  minimalError,
} = require("../../utils");
const { translateTokenSet } = require("../tokenResponse");
const { staticRefreshTokenIssueCounter } = require("../../metrics");
const { de } = require("date-fns/locale");

class TokenHandlerClient {
  constructor(
    getTokenStrategy,
    getDocumentFromDynamoStrategy,
    saveDocumentToDynamoStrategy,
    getPatientInfoStrategy,
    tokenIssueCounter,
    dbMissCounter,
    logger,
    config,
    staticTokens,
    dynamoClient,
    req,
    res,
    next
  ) {
    this.getTokenStrategy = getTokenStrategy;
    this.getDocumentStrategy = getDocumentFromDynamoStrategy;
    this.saveDocumentToDynamoStrategy = saveDocumentToDynamoStrategy;
    this.getPatientInfoStrategy = getPatientInfoStrategy;
    this.tokenIssueCounter = tokenIssueCounter;
    this.dbMissCounter = dbMissCounter;
    this.logger = logger;
    this.config = config;
    this.staticTokens = staticTokens;
    this.dynamoClient = dynamoClient;
    this.req = req;
    this.res = res;
    this.next = next;
  }
  async handleToken() {
    let tokens;
    /*
     * Check against the static token service
     *
     * If nothing is found, continue with normal flow
     */
    if (
      this.config.enable_static_token_service &&
      this.req.body.grant_type == "refresh_token"
    ) {
      try {
        if (this.staticTokens.size == 0) {
          let payload;
          payload = await this.dynamoClient.scanFromDynamo(
            this.config.dynamo_static_token_table
          );
          let self = this;
          payload.Items.forEach(function (staticToken) {
            self.staticTokens.set(staticToken.refresh_token, staticToken);
          });
        }
      } catch (err) {
        this.logger.error(
          "Could not load static tokens list",
          minimalError(err)
        );
      }
      let hashedRefreshToken = hashString(
        this.req.body.refresh_token,
        this.config.hmac_secret
      );
      if (this.staticTokens.has(hashedRefreshToken)) {
        let staticToken = this.staticTokens.get(hashedRefreshToken);
        tokens = {
          access_token: staticToken.access_token,
          refresh_token: this.req.body.refresh_token,
          token_type: "Bearer",
          scope: staticToken.scopes,
          expires_in: staticToken.expires_in,
        };
        if (staticToken.id_token) {
          tokens.id_token = staticToken.id_token;
        }
        if (staticToken.icn) {
          tokens.patient = staticToken.icn;
        }
        staticRefreshTokenIssueCounter.inc();
        return {
          statusCode: 200,
          responseBody: tokens,
        };
      }
    }
    /*
     * Lookup a previous document (db record) associated with this request.
     *
     * If nothing is found, log the event and return an error.
     */
    let document;
    if (this.getDocumentStrategy) {
      document = await this.getDocumentStrategy.getDocument();
      if (!document) {
        this.logger.warn("Previous document not found for provided grant");
        if (this.dbMissCounter) {
          this.dbMissCounter.inc();
        }
        return {
          statusCode: 400,
          responseBody: {
            error: "invalid_grant",
            error_description:
              "The provided authorization grant or refresh token is expired or otherwise invalid.",
          },
        };
      }
    }

    // Reject if launch and not base64 decoded json
    let decodedLaunch;
    let isLaunch;
    if (document.isLaunch) {
      decodedLaunch = document.decodedLaunch;
      delete document.decodedLaunch;
      isLaunch = document.isLaunch;
      delete document.isLaunch;
    }
    if (isLaunch && decodedLaunch.isError) {
      this.logger.error(
        decodedLaunch.errorPayload.message,
        minimalError(decodedLaunch.errorPayload.cause)
      );
      return {
        statusCode: 400,
        responseBody: {
          error: "invalid_request",
          error_description: "Bad request.",
        },
      };
    }

    try {
      tokens = await this.getTokenStrategy.getToken();
      this.tokenIssueCounter.inc();
    } catch (error) {
      rethrowIfRuntimeError(error);
      if (!error || !error.statusCode || !error.error) {
        throw error;
      }
      return {
        statusCode: error.statusCode,
        responseBody: {
          error: error.error,
          error_description: error.error_description,
        },
      };
    }

    let state;
    if (tokens) {
      await this.saveDocumentToDynamoStrategy.saveDocumentToDynamo(
        document,
        tokens
      );
      state = document.state || null;
    }
    state = state || null;

    //Creates a Token Response
    const tokenResponseBase = translateTokenSet(tokens);
    let responseBody = { ...tokenResponseBase, state };

    if (tokens && tokens.scope) {
      if (tokens.scope.split(" ").includes("launch/patient")) {
        responseBody[
          "patient"
        ] = await this.getPatientInfoStrategy.createPatientInfo(tokens);
      } else if (decodedLaunch) {
        for (let key in decodedLaunch) {
          if (!responseBody[key]) {
            responseBody[key] = decodedLaunch[key];
          }
        }
      }
    }
    return { statusCode: 200, responseBody: responseBody };
  }
}

module.exports = { TokenHandlerClient };
