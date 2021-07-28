const { rethrowIfRuntimeError } = require("../../utils");
const { translateTokenSet } = require("../tokenResponse");

class TokenHandlerClient {
  constructor(
    getTokenStrategy,
    getDocumentFromDynamoStrategy,
    saveDocumentToDynamoStrategy,
    getPatientInfoStrategy,
    tokenIssueCounter,
    dbMissCounter,
    logger,
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
    this.req = req;
    this.res = res;
    this.next = next;
  }
  async handleToken() {
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

    let tokens;
    try {
      tokens = await this.getTokenStrategy.getToken();
      this.tokenIssueCounter.inc();
    } catch (error) {
      rethrowIfRuntimeError(error);
      //change here
      if (error.statusCode !== undefined && error.statusCode === 401) {
        return {
          statusCode: 401,
          responseBody: {
            error: "invalid_client",
            error_description: "Invalid value for client_id parameter.",
          },
        };
      }
      return {
        statusCode: error.statusCode,
        responseBody: {
          error: error.error,
          error_description: error.error_description,
        },
      };
    }

    if (tokens.is_static) {
      delete tokens.is_static;
      return {
        statusCode: 200,
        responseBody: tokens,
      };
    }

    let state;
    let launch;
    if (tokens) {
      await this.saveDocumentToDynamoStrategy.saveDocumentToDynamo(
        document,
        tokens
      );
      state = document.state || null;
      launch = document.launch;
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
      } else if (tokens.scope.split(" ").includes("launch") && launch) {
        try {
          let decodedLaunch = JSON.parse(
            Buffer.from(launch, "base64").toString("ascii")
          );
          for (let key in decodedLaunch) {
            if (!responseBody[key]) {
              responseBody[key] = decodedLaunch[key];
            }
          }
        } catch (error) {
          //Assume patient and add normally
          responseBody["patient"] = launch;
        }
      }
    }
    return { statusCode: 200, responseBody: responseBody };
  }
}

module.exports = { TokenHandlerClient };
