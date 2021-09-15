const { hashString, parseBearerAuthorization } = require("../utils");
const {
  GetDocumentByAccessTokenStrategy,
} = require("./tokenHandlerStrategyClasses/documentStrategies/getDocumentByAccessTokenStrategy");

/**
 * Handler for looking up tokens issued via the oauth-proxy by access_token.
 *
 * @param {*} config - The app config.
 * @param {winston.Logger} logger - The logger.
 * @param {DynamoClient} dynamoClient - The dynamo client.
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The next object.
 * @param {Function} next - The next function.
 * @returns {Promise<this|*>}
 */
const issuedRequestHandler = async (
  config,
  logger,
  dynamoClient,
  req,
  res,
  next
) => {
  const getDocumentStrategy = new GetDocumentByAccessTokenStrategy(
    logger,
    dynamoClient,
    config,
    hashString
  );
  let access_token;

  if (req.headers && req.headers.authorization) {
    access_token = parseBearerAuthorization(req.headers.authorization);
  }
  if (!access_token) {
    return res.sendStatus(401);
  }

  let staticDocumentResponse;
  if (config.enable_static_token_service) {
    staticDocumentResponse = await getDocumentStrategy.getDocument(
      access_token,
      config.dynamo_static_token_table
    );
  }

  let response =
    staticDocumentResponse && staticDocumentResponse.access_token
      ? staticTokenHandler(staticDocumentResponse, logger, config)
      : await nonStaticTokenHandler(dynamoClient, access_token, config, logger);

  if (!response) {
    return res.sendStatus(401);
  }

  if (response.error) {
    return next(response.error);
  }

  res.status(response.status);
  if (response.json) {
    res.json(response.json);
  }
  return next();
};

/**
 * Static token handler.
 *
 * @param {DynamoDB.BatchStatementResponse.Item} staticDocumentResponse - Dynamo document.
 * @param {winston.Logger} logger - The logger.
 * @param {*} config - The app config.
 * @returns {{json: {aud: (string|string|string[]|*), static: boolean, icn: (string|{S: string}), scopes: *, expires_in: *}, status: number}|{status: number}}
 */
const staticTokenHandler = (staticDocumentResponse, logger, config) => {
  let token_icn_pair =
    staticDocumentResponse.access_token + "-" + staticDocumentResponse.icn;
  if (
    hashString(token_icn_pair, config.hmac_secret) ==
    staticDocumentResponse.checksum
  ) {
    return {
      status: 200,
      json: {
        static: true,
        scopes: staticDocumentResponse.scopes,
        expires_in: staticDocumentResponse.expires_in,
        icn: staticDocumentResponse.icn,
        aud: staticDocumentResponse.aud,
      },
    };
  }
  logger.error("Invalid static token usage detected.");
  return {
    status: 401,
  };
};

/**
 * Non-static token handler.
 *
 * @param {DynamoClient} dynamoClient - The dynamo client.
 * @param {string} access_token - The un-hashed access token.
 * @param {*} config - The app config.
 * @param {winston.Logger} logger - The logger.
 * @returns {Promise<{json: {proxy: *, static: boolean}, status: number}|{error: *}|{status: number}>}
 */
const nonStaticTokenHandler = async (
  dynamoClient,
  access_token,
  config,
  logger
) => {
  let nonStaticDocumentResponse;

  try {
    const nonStaticDocumentResponses = await dynamoClient.queryFromDynamo(
      {
        access_token: hashString(access_token, config.hmac_secret),
      },
      config.dynamo_oauth_requests_table,
      "oauth_access_token_index"
    );

    if (
      nonStaticDocumentResponses.Items &&
      nonStaticDocumentResponses.Items[0]
    ) {
      nonStaticDocumentResponse = nonStaticDocumentResponses.Items[0];
    }
  } catch (error) {
    logger.error("Error retrieving token claims", error);
    return { error: error };
  }

  if (nonStaticDocumentResponse && nonStaticDocumentResponse.access_token) {
    if (!nonStaticDocumentResponse.proxy) {
      return {
        status: 403,
      };
    }
    return {
      status: 200,
      json: {
        static: false,
        proxy: nonStaticDocumentResponse.proxy,
        aud: nonStaticDocumentResponse.aud,
      },
    };
  }
};

module.exports = issuedRequestHandler;
