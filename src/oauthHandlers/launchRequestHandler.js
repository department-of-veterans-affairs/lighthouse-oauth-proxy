const { hashString, parseBearerAuthorization } = require("../utils");
const {
  GetDocumentByAccessTokenStrategy,
} = require("./tokenHandlerStrategyClasses/documentStrategies/getDocumentByAccessTokenStrategy");

/*
 * Handler for looking up SMART launch context by access_token.
 */
const launchRequestHandler = async (
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
  let hashedToken = hashString(access_token, config.hmac_secret);
  let documentResponse = await getDocumentStrategy.getDocument(
    hashedToken,
    config.dynamo_launch_context_table
  );

  if (documentResponse && documentResponse.launch) {
    res.json({ launch: documentResponse.launch });
  } else {
    return res.sendStatus(401);
  }

  return next();
};

module.exports = launchRequestHandler;
