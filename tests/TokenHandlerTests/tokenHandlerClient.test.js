require("jest");

const {
  TokenHandlerClient,
} = require("../../src/oauthHandlers/tokenHandlerStrategyClasses/tokenHandlerClient");
const {
  buildGetDocumentStrategy,
  buildSaveDocumentStrategy,
  buildGetPatientInfoStrategy,
  buildToken,
  buildGetTokenStrategy,
} = require("./tokenHandlerTestUtils");
const { buildFakeDynamoClient, createFakeConfig } = require("../testUtils");
const MockExpressRequest = require("mock-express-request");
const MockExpressResponse = require("mock-express-response");
const { staticRefreshTokenIssueCounter } = require("../../src/metrics");

describe("handleToken tests", () => {
  let getTokenResponseStrategy;
  let pullDocumentFromDynamoStrategy;
  let saveDocumentToDynamoStrategy;
  let getPatientInfoStrategy;
  let tokenIssueCounter;
  let dbMissCounter;
  let logger;
  let dynamoClient;
  let config;
  let staticTokens;
  let req;
  let res;
  let next;

  /*
   * Utility to build a tokenHandlerClient with reasonable defaults and
   * ability to override all settings. Reduces duplicative code.
   */
  const buildTokenClient = function (clientConfig) {
    let token = Object.prototype.hasOwnProperty.call(clientConfig, "token")
      ? clientConfig.token
      : buildToken(true, false, false, "email.read");

    getTokenResponseStrategy = Object.prototype.hasOwnProperty.call(
      clientConfig,
      "getTokenResponseStrategy"
    )
      ? clientConfig.getTokenResponseStrategy
      : buildGetTokenStrategy(token, false);

    pullDocumentFromDynamoStrategy = Object.prototype.hasOwnProperty.call(
      clientConfig,
      "pullDocumentFromDynamoStrategy"
    )
      ? clientConfig.pullDocumentFromDynamoStrategy
      : buildGetDocumentStrategy({});

    saveDocumentToDynamoStrategy = Object.prototype.hasOwnProperty.call(
      clientConfig,
      "saveDocumentToDynamoStrategy"
    )
      ? clientConfig.saveDocumentToDynamoStrategy
      : buildSaveDocumentStrategy();

    getPatientInfoStrategy = Object.prototype.hasOwnProperty.call(
      clientConfig,
      "getPatientInfoStrategy"
    )
      ? clientConfig.getPatientInfoStrategy
      : buildGetPatientInfoStrategy({});

    tokenIssueCounter = Object.prototype.hasOwnProperty.call(
      clientConfig,
      "tokenIssueCounter"
    )
      ? clientConfig.tokenIssueCounter
      : { inc: jest.fn() };

    dbMissCounter = Object.prototype.hasOwnProperty.call(
      clientConfig,
      "dbMissCounter"
    )
      ? clientConfig.dbMissCounter
      : { inc: jest.fn() };

    logger = Object.prototype.hasOwnProperty.call(clientConfig, "logger")
      ? clientConfig.logger
      : { warn: jest.fn() };

    dynamoClient = Object.prototype.hasOwnProperty.call(
      clientConfig,
      "dynamoClient"
    )
      ? clientConfig.dynamoClient
      : buildFakeDynamoClient({});

    config = Object.prototype.hasOwnProperty.call(clientConfig, "config")
      ? clientConfig.config
      : createFakeConfig();

    staticTokens = Object.prototype.hasOwnProperty.call(
      clientConfig,
      "staticTokens"
    )
      ? clientConfig.staticTokens
      : new Map();

    req = Object.prototype.hasOwnProperty.call(clientConfig, "req")
      ? clientConfig.req
      : new MockExpressRequest({ body: { grant_type: "authorization_code" } });

    res = Object.prototype.hasOwnProperty.call(clientConfig, "res")
      ? clientConfig.res
      : new MockExpressResponse();

    next = Object.prototype.hasOwnProperty.call(clientConfig, "next")
      ? clientConfig.next
      : jest.fn();

    return new TokenHandlerClient(
      getTokenResponseStrategy,
      pullDocumentFromDynamoStrategy,
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
    );
  };

  it("Happy Path Static", async () => {
    const staticRefreshCounterSpy = jest.spyOn(
      staticRefreshTokenIssueCounter,
      "inc"
    );
    let req = new MockExpressRequest({
      body: {
        grant_type: "refresh_token",
        refresh_token: "987654321",
      },
    });
    let config = {
      enable_static_token_service: true,
      hmac_secret: "secret",
    };
    let staticTokens = new Map().set(
      "6a9cf6b1af1d8205b771d7c7b7e1770e630f763a755b2f86833ee8ce544df25e",
      {
        icn: "0123456789",
        refresh_token:
          "6a9cf6b1af1d8205b771d7c7b7e1770e630f763a755b2f86833ee8ce544df25e",
        access_token: "static-access-token",
        scopes:
          "openid profile patient/Medication.read launch/patient offline_access",
        expires_in: 3600,
        id_token: "static-id-token",
      }
    );
    let token = {
      access_token: "static-access-token",
      refresh_token: "987654321",
      token_type: "Bearer",
      scope:
        "openid profile patient/Medication.read launch/patient offline_access",
      expires_in: 3600,
      id_token: "static-id-token",
      patient: "0123456789",
    };
    let tokenHandlerClient = buildTokenClient({
      token: token,
      req: req,
      config: config,
      staticTokens: staticTokens,
    });

    let response = await tokenHandlerClient.handleToken();

    expect(staticRefreshCounterSpy).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    expect(response.responseBody).toStrictEqual(token);
  });

  it("Happy Path no launch/patient", async () => {
    let token = buildToken(false, false, false, "email.read");

    let tokenHandlerClient = buildTokenClient({
      token: token,
      getTokenResponseStrategy: buildGetTokenStrategy(token),
      getPatientInfoStrategy: buildGetPatientInfoStrategy("patient"),
    });

    let response = await tokenHandlerClient.handleToken();

    expect(tokenIssueCounter.inc).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.responseBody.access_token).toBe(token.access_token);
  });

  it("Happy Path with launch/patient", async () => {
    let token = buildToken(false, true, true, "launch/patient");

    let tokenHandlerClient = buildTokenClient({
      token: token,
      getPatientInfoStrategy: buildGetPatientInfoStrategy("patient"),
    });

    let response = await tokenHandlerClient.handleToken();

    expect(tokenIssueCounter.inc).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.responseBody.access_token).toBe(token.access_token);
    expect(response.responseBody.patient).toBe("patient");
  });

  it("Happy Path with launch", async () => {
    let token = buildToken(false, true, false, "launch");

    let tokenHandlerClient = buildTokenClient({
      token: token,
      pullDocumentFromDynamoStrategy: buildGetDocumentStrategy({
        launch: "patient",
      }),
      getPatientInfoStrategy: buildGetPatientInfoStrategy("patient"),
    });

    let response = await tokenHandlerClient.handleToken();

    expect(tokenIssueCounter.inc).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.responseBody.access_token).toBe(token.access_token);
    expect(response.responseBody.patient).toBe("patient");
  });

  it("Happy Path with launch base64", async () => {
    let token = buildToken(false, true, false, "launch");

    let tokenHandlerClient = buildTokenClient({
      token: token,
      pullDocumentFromDynamoStrategy: buildGetDocumentStrategy({
        launch:
          "ewogICJwYXRpZW50IjogIjEyMzRWNTY3OCIsCiAgImVuY291bnRlciI6ICI5ODc2LTU0MzItMTAwMCIKfQ==",
      }),
      getPatientInfoStrategy: buildGetPatientInfoStrategy("patient"),
    });

    let response = await tokenHandlerClient.handleToken();

    expect(tokenIssueCounter.inc).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.responseBody.access_token).toBe(token.access_token);
    expect(response.responseBody.patient).toBe("1234V5678");
  });

  it("getToken 401 Response", async () => {
    let err = {
      statusCode: 401,
      error: "invalid_client",
      error_description: "error description",
    };

    let tokenHandlerClient = buildTokenClient({
      getTokenResponseStrategy: buildGetTokenStrategy(err, true),
    });

    let response = await tokenHandlerClient.handleToken();

    expect(tokenIssueCounter.inc).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
    expect(response.responseBody.error).toBe("invalid_client");
    expect(response.responseBody.error_description).toBe("error description");
  });

  it("getToken 500 Response", async () => {
    let err = {
      statusCode: 500,
      error: "error",
      error_description: "error_description",
    };

    let tokenHandlerClient = buildTokenClient({
      getTokenResponseStrategy: buildGetTokenStrategy(err, true),
    });

    let response = await tokenHandlerClient.handleToken();

    expect(tokenIssueCounter.inc).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(500);
    expect(response.responseBody.error).toBe("error");
    expect(response.responseBody.error_description).toBe("error_description");
  });

  it("getToken non okta error", async () => {
    let err = {
      different: "this error does not follow the okta structure.",
    };

    let tokenHandlerClient = buildTokenClient({
      getTokenResponseStrategy: buildGetTokenStrategy(err, true),
    });

    try {
      await tokenHandlerClient.handleToken();
      fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBe(err);
    }
  });

  it("missing document returns 400 error (without metrics)", async () => {
    let tokenHandlerClient = buildTokenClient({
      pullDocumentFromDynamoStrategy: buildGetDocumentStrategy(undefined),
      dbMissCounter: undefined,
    });

    let response = await tokenHandlerClient.handleToken();

    expect(response.statusCode).toBe(400);
    expect(logger.warn).toHaveBeenCalled();
    expect(response.responseBody.error).toBe("invalid_grant");
  });

  it("missing document returns 400 error (with metrics)", async () => {
    let tokenHandlerClient = buildTokenClient({
      pullDocumentFromDynamoStrategy: buildGetDocumentStrategy(undefined),
      dbMissCounter: {
        inc: jest.fn(),
      },
    });

    let response = await tokenHandlerClient.handleToken();

    expect(dbMissCounter.inc).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
    expect(response.statusCode).toBe(400);
    expect(response.responseBody.error).toBe("invalid_grant");
  });
});
