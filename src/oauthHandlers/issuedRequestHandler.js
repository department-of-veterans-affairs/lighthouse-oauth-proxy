const { errors } = require("openid-client");
const { hashString, parseBearerAuthorization } = require("../utils");
const {
  GetDocumentByAccessTokenStrategy,
} = require("./tokenHandlerStrategyClasses/documentStrategies/getDocumentByAccessTokenStrategy");

/*
 * Handler for looking up Lighthouse issued tokens by access_token.
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
  let staticDocumentResponse = await getDocumentStrategy.getDocument(
    access_token,
    config.dynamo_static_token_table
  );

  let response =
    staticDocumentResponse && staticDocumentResponse.access_token
      ? staticTokenHandler(staticDocumentResponse, logger, config)
      : await nonStaticTokenHandler(dynamoClient, access_token, config);

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

const nonStaticTokenHandler = async (dynamoClient, access_token, config) => {
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
    return next(error);
  }

  if (nonStaticDocumentResponse && nonStaticDocumentResponse.access_token) {
    if (!nonStaticDocumentResponse.proxy) {
      return {
        status: 403,
      };
    } else {
      return {
        status: 200,
        json: {
          static: false,
          proxy: nonStaticDocumentResponse.proxy,
        },
      };
    }
  }
};

module.exports = issuedRequestHandler;
