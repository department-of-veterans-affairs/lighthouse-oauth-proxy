const {
  RefreshTokenStrategy,
} = require("./tokenStrategies/refreshTokenStrategy");
const {
  AuthorizationCodeStrategy,
} = require("./tokenStrategies/authorizationCodeStrategy");
const {
  ClientCredentialsStrategy,
} = require("./tokenStrategies/clientCredentialsStrategy");
const {
  UnsupportedGrantStrategy,
} = require("./tokenStrategies/unsupportedGrantStrategy");
const { TokenHandlerClient } = require("./tokenHandlerClient");
const {
  GetDocumentByCodeStrategy,
} = require("./documentStrategies/getDocumentByCodeStrategy");
const {
  GetDocumentByRefreshTokenStrategy,
} = require("./documentStrategies/getDocumentByRefreshTokenStrategy");
const {
  GetDocumentByLaunchStrategy,
} = require("./documentStrategies/getDocumentByLaunchStrategy");
const {
  SaveDocumentStateStrategy,
} = require("./saveDocumentStrategies/saveDocumentStateStrategy");
const {
  SaveDocumentLaunchStrategy,
} = require("./saveDocumentStrategies/saveDocumentLaunchStrategy");
const {
  GetPatientInfoFromValidateEndpointStrategy,
} = require("./getPatientInfoStrategies/getPatientInfoFromValidateEndpointStrategy");
const {
  GetPatientInfoFromLaunchStrategy,
} = require("./getPatientInfoStrategies/getPatientInfoFromLaunchStrategy");
const { parseBasicAuth, screenForV2ClientId } = require("../../utils");
const {
  codeTokenIssueCounter,
  refreshTokenIssueCounter,
  clientCredentialsTokenIssueCounter,
  refreshTokenLifeCycleHistogram,
  missRefreshTokenCounter,
  missAuthorizationCodeCounter,
} = require("../../metrics");

/**
 * Token handler client builder.
 *
 * @param {string} redirect_uri - The redirect URI.
 * @param {Issuer} issuer - The OIDC issuer.
 * @param {winston.Logger} logger - The logger.
 * @param {DynamoClient} dynamoClient - The dynamo client.
 * @param {*} config - The app config.
 * @param {express.Request} req - The HTTP request.
 * @param {express.Response} res - The HTTP response.
 * @param {Function} next - The express next function.
 * @param {Function} validateToken - Function used to validate a token.
 * @param {Map} staticTokens - Map of static tokens.
 * @param {*} app_category - The proxy route config.
 * @returns {TokenHandlerClient} a token handler client.
 */
const buildTokenHandlerClient = async (
  redirect_uri,
  issuer,
  logger,
  dynamoClient,
  config,
  req,
  res,
  next,
  validateToken,
  staticTokens,
  app_category
) => {
  const strategies = await getStrategies(
    redirect_uri,
    issuer,
    logger,
    dynamoClient,
    config,
    req,
    validateToken,
    staticTokens,
    app_category
  );
  return new TokenHandlerClient(
    strategies.getTokenStrategy,
    strategies.getDocumentFromDynamoStrategy,
    strategies.saveDocumentToDynamoStrategy,
    strategies.getPatientInfoStrategy,
    strategies.tokenIssueCounter,
    strategies.dbMissCounter,
    logger,
    config,
    staticTokens,
    dynamoClient,
    req,
    res,
    next
  );
};

/**
 * Build an object of strategies for token handling.
 *
 * @param {string} redirect_uri - The redirect URI.
 * @param {Issuer} issuer - The OIDC issuer.
 * @param {winston.Logger} logger - The logger.
 * @param {DynamoClient} dynamoClient - The dynamo client.
 * @param {*} config - The app config.
 * @param {express.Request} req - The HTTP request.
 * @param {Function} validateToken - Function used to validate a token.
 * @param {Map} staticTokens - Map of static tokens.
 * @param {*} app_category - The proxy route config.
 * @returns {*} an object of strategies.
 */
const getStrategies = async (
  redirect_uri,
  issuer_orig,
  logger,
  dynamoClient,
  config,
  req,
  validateToken,
  staticTokens,
  app_category
) => {
  let strategies;
  if (req.body.grant_type === "refresh_token") {
    const clientMetadata = await createClientMetadata(
      redirect_uri,
      req,
      config,
      dynamoClient,
      issuer_orig
    );
    let issuer = clientMetadata.issuer;
    strategies = {
      getTokenStrategy: new RefreshTokenStrategy(
        req,
        logger,
        new issuer.Client(clientMetadata)
      ),
      getDocumentFromDynamoStrategy: new GetDocumentByRefreshTokenStrategy(
        req,
        logger,
        dynamoClient,
        config
      ),
      saveDocumentToDynamoStrategy: new SaveDocumentStateStrategy(
        req,
        logger,
        dynamoClient,
        config,
        issuer.issuer,
        refreshTokenLifeCycleHistogram
      ),
      getPatientInfoStrategy: new GetPatientInfoFromValidateEndpointStrategy(
        validateToken,
        logger,
        app_category.audience
      ),
      tokenIssueCounter: refreshTokenIssueCounter,
      dbMissCounter: missRefreshTokenCounter,
    };
  } else if (req.body.grant_type === "authorization_code") {
    const clientMetadata = await createClientMetadata(
      redirect_uri,
      req,
      config,
      dynamoClient,
      issuer_orig
    );
    const issuer = clientMetadata.issuer;
    let issuerClient = new issuer.Client(clientMetadata);
    strategies = {
      getTokenStrategy: new AuthorizationCodeStrategy(
        req,
        logger,
        redirect_uri,
        issuerClient
      ),
      getDocumentFromDynamoStrategy: new GetDocumentByCodeStrategy(
        req,
        logger,
        dynamoClient,
        config
      ),
      saveDocumentToDynamoStrategy: new SaveDocumentStateStrategy(
        req,
        logger,
        dynamoClient,
        config,
        issuer.issuer,
        refreshTokenLifeCycleHistogram
      ),
      getPatientInfoStrategy: new GetPatientInfoFromValidateEndpointStrategy(
        validateToken,
        logger,
        app_category.audience
      ),
      tokenIssueCounter: codeTokenIssueCounter,
      dbMissCounter: missAuthorizationCodeCounter,
    };
  } else if (req.body.grant_type === "client_credentials") {
    if (
      req.body.client_assertion_type !==
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
    ) {
      throw {
        status: 400,
        error: "invalid_request",
        error_description: "Client assertion type must be jwt-bearer.",
      };
    }
    strategies = {
      getTokenStrategy: new ClientCredentialsStrategy(
        req,
        logger,
        issuer_orig.token_endpoint
      ),
      getDocumentFromDynamoStrategy: new GetDocumentByLaunchStrategy(req),
      saveDocumentToDynamoStrategy: new SaveDocumentLaunchStrategy(
        logger,
        dynamoClient,
        config
      ),
      getPatientInfoStrategy: new GetPatientInfoFromLaunchStrategy(req),
      tokenIssueCounter: clientCredentialsTokenIssueCounter,
    };
  } else {
    if (!req.body.grant_type) {
      throw {
        status: 400,
        error: "invalid_request",
        error_description:
          "A grant type is required. Supported grant types are authorization_code, refresh_token, and client_credentials.",
      };
    }
    strategies = { getTokenStrategy: new UnsupportedGrantStrategy() };
  }
  return strategies;
};

async function createClientMetadata(
  redirect_uri,
  req,
  config,
  dynamoClient,
  issuer
) {
  let clientMetadata = {
    redirect_uris: [redirect_uri],
  };

  const basicAuth = parseBasicAuth(req);
  if (basicAuth) {
    clientMetadata.client_id = basicAuth.username;
    clientMetadata.client_secret = basicAuth.password;
  } else if (req.body.client_id && req.body.client_secret) {
    clientMetadata.client_id = req.body.client_id;
    clientMetadata.client_secret = req.body.client_secret;
    delete req.body.client_id;
    delete req.body.client_secret;
  } else if (config.enable_pkce_authorization_flow && req.body.client_id) {
    clientMetadata.token_endpoint_auth_method = "none";
    clientMetadata.client_id = req.body.client_id;
    delete req.body.client_id;
  } else {
    throw {
      status: 401,
      error: "invalid_client",
      error_description: "Client authentication failed",
    };
  }
  const v2transitiondata = await screenForV2ClientId(
    clientMetadata.client_id,
    dynamoClient,
    config,
    req.path
  );
  clientMetadata.issuer =
    v2transitiondata.client_id === clientMetadata.client_id &&
    v2transitiondata.fallback
      ? v2transitiondata.fallback.issuer
      : issuer;
  clientMetadata.client_id = v2transitiondata.client_id;

  return clientMetadata;
}

module.exports = { buildTokenHandlerClient };
