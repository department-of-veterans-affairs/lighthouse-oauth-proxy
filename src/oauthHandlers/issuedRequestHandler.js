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
  if (documentResponse && documentResponse.static_access_token) {
    res.json({
      static: true,
      scopes: documentResponse.static_scopes,
      expires_in: documentResponse.static_expires_in,
      icn: documentResponse.static_icn,
      aud: documentResponse.static_aud,
    });
  } else {
    return res.sendStatus(401);
  }

  return next();
};

module.exports = issuedRequestHandler;
