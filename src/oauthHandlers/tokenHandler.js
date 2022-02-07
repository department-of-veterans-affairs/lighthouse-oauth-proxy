const { rethrowIfRuntimeError } = require("../utils");
const {
  buildTokenHandlerClient,
} = require("./tokenHandlerStrategyClasses/tokenHandlerClientBuilder");

/**
 * Handle a token request.
 *
 * @param {*} config - The app config.
 * @param {string} redirect_uri - The redirect URI.
 * @param {winston.Logger} logger - The logger.
 * @param {Issuer} issuer - The OIDC issuer.
 * @param {DynamoClient} dynamoClient - The dynamo client.
 * @param {Function} validateToken - Function used to validate a token.
 * @param {Map} staticTokens - Map of static tokens.
 * @param {*} app_category - The proxy route config.
 * @param {express.Request} req - The HTTP request.
 * @param {express.Response} res - The HTTP response.
 * @param {Function} next - The express next function.
 * @returns {Promise<*>} a promise to handle the token request.
 */
const tokenHandler = async (
  config,
  redirect_uri,
  logger,
  issuer,
  dynamoClient,
  validateToken,
  staticTokens,
  app_category,
  req,
  res,
  next
) => {
  buildTokenHandlerClient(
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
  )
    .then((tokenHandlerClient) => {
      tokenHandlerClient
        .handleToken()
        .then((tokenResponse) => {
          res.status(tokenResponse.statusCode).json(tokenResponse.responseBody);
          return next();
        })
        .catch((err) => {
          return next(err);
        });
    })
    .catch((error) => {
      rethrowIfRuntimeError(error);
      res.status(error.status).json({
        error: error.error,
        error_description: error.error_description,
      });
      return next();
    });
};

module.exports = tokenHandler;
