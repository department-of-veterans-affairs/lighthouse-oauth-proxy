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
const { parseBasicAuth } = require("../../utils");
const {
  codeTokenIssueCounter,
  refreshTokenIssueCounter,
  clientCredentialsTokenIssueCounter,
  refreshTokenLifeCycleHistogram,
  missRefreshTokenCounter,
  missAuthorizationCodeCounter,
} = require("../../metrics");
const buildTokenHandlerClient = (
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
  audience
) => {
  const strategies = getStrategies(
    redirect_uri,
    issuer,
    logger,
    dynamoClient,
    config,
    req,
    validateToken,
    staticTokens,
    audience
  );
  return new TokenHandlerClient(
    strategies.getTokenStrategy,
    strategies.getDocumentFromDynamoStrategy,
    strategies.saveDocumentToDynamoStrategy,
    strategies.getPatientInfoStrategy,
    strategies.tokenIssueCounter,
    strategies.dbMissCounter,
    logger,
    req,
    res,
    next
  );
};

const getStrategies = (
  redirect_uri,
  issuer,
  logger,
  dynamoClient,
  config,
  req,
  validateToken,
  staticTokens,
  audience
) => {
  let strategies;
  if (req.body.grant_type === "refresh_token") {
    const clientMetadata = createClientMetadata(redirect_uri, req, config);
    strategies = {
      getTokenStrategy: new RefreshTokenStrategy(
        req,
        logger,
        new issuer.Client(clientMetadata),
        dynamoClient,
        config,
        staticTokens
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
        refreshTokenLifeCycleHistogram,
        clientMetadata.client_id
      ),
      getPatientInfoStrategy: new GetPatientInfoFromValidateEndpointStrategy(
        validateToken,
        logger,
        audience
      ),
      tokenIssueCounter: refreshTokenIssueCounter,
      dbMissCounter: missRefreshTokenCounter,
    };
  } else if (req.body.grant_type === "authorization_code") {
    const clientMetadata = createClientMetadata(redirect_uri, req, config);
    strategies = {
      getTokenStrategy: new AuthorizationCodeStrategy(
        req,
        logger,
        redirect_uri,
        new issuer.Client(clientMetadata)
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
        refreshTokenLifeCycleHistogram,
        clientMetadata.client_id
      ),
      getPatientInfoStrategy: new GetPatientInfoFromValidateEndpointStrategy(
        validateToken,
        logger,
        audience
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
        issuer.token_endpoint
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

function createClientMetadata(redirect_uri, req, config) {
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
  return clientMetadata;
}

module.exports = { buildTokenHandlerClient };