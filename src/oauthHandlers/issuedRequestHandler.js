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
  let access_token = parseBearerAuthorization(req.headers.authorization);
  if (!access_token) {
    return res.sendStatus(401);
  }
  let documentResponse = await getDocumentStrategy.getDocument(
    access_token,
    config.dynamo_static_token_table
  );
  if (documentResponse && documentResponse.access_token) {
    let cross_check =
      documentResponse.access_token + "-" + documentResponse.icn;
    if (
      hashString(cross_check, config.hmac_secret) ==
      documentResponse.cross_hash
    ) {
      res.json({
        static: true,
        scopes: documentResponse.scopes,
        expires_in: documentResponse.expires_in,
        icn: documentResponse.icn,
        aud: documentResponse.aud,
      });
    } else {
      logger.error("Invalid static token usage detected.");
      return res.sendStatus(401);
    }
  } else {
    return res.sendStatus(401);
  }

  return next();
};

module.exports = issuedRequestHandler;
