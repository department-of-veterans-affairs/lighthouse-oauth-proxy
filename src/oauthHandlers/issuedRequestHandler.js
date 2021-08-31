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
  if (staticDocumentResponse && staticDocumentResponse.access_token) {
    let token_icn_pair =
      staticDocumentResponse.access_token + "-" + staticDocumentResponse.icn;
    if (
      hashString(token_icn_pair, config.hmac_secret) ==
      staticDocumentResponse.checksum
    ) {
      res.json({
        static: true,
        scopes: staticDocumentResponse.scopes,
        expires_in: staticDocumentResponse.expires_in,
        icn: staticDocumentResponse.icn,
        aud: staticDocumentResponse.aud,
      });
      return next();
    } else {
      logger.error("Invalid static token usage detected.");
      return res.sendStatus(401);
    }
  }

  let nonStaticDocumentResponse;

  /*
   * Lookup token and claims using hash.
   */
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
    /*
     * If data can't be queried, log the error and bail.
     */
    logger.error("Error retrieving token claims", error);
    return next(error);
  }

  if (nonStaticDocumentResponse && nonStaticDocumentResponse.access_token) {
    if (!nonStaticDocumentResponse.proxy) {
      return res.sendStatus(403);
    }
    res.json({
      static: false,
      proxy: nonStaticDocumentResponse.proxy,
    });
    return next();
  }

  res.sendStatus(401);
  return next();
};

module.exports = issuedRequestHandler;
