const { URLSearchParams, URL } = require("url");
const { loginBegin } = require("../metrics");
const { v4: uuidv4 } = require("uuid");
const { addMinutes, getUnixTime } = require("date-fns");
const {
  screenClientForFallback,
  rewriteRedirect,
  launchValidation,
} = require("../utils");
/**
 * Checks for valid authorization request and proxies to authorization server.
 *
 * @param {string} redirect_uri uri the authorization response will be sent to.
 * @param {winston.Logger} logger logs information.
 * @param {Issuer} issuer holds information and sends request to token issuer.
 * @param {DynamoClient} dynamoClient interacts with dynamodb.
 * @param {okta.Client} oktaClient interacts with okta api.
 * @param {SlugHelper} slugHelper rewrites identity provider id to slug.
 * @param {*} app_category contains information on the route's specific issuer and auth server.
 * @param {*} config application configuration.
 * @param {express.Request} req express request object.
 * @param {express.Response} res express response object.
 * @param {Function} next express next function.
 */
const authorizeHandler = async (
  redirect_uri,
  logger,
  issuer,
  dynamoClient,
  oktaClient,
  slugHelper,
  app_category,
  config,
  req,
  res,
  next
) => {
  loginBegin.inc();
  const { state, client_id, redirect_uri: client_redirect } = req.query;
  let fallback = await screenClientForFallback(
    client_id,
    dynamoClient,
    config,
    req.path
  );
  let okta_client = oktaClient;
  let issuer_data = issuer;
  let client_validation_app_category = app_category;
  if (fallback) {
    issuer_data = fallback.issuer;
    okta_client = app_category.fallback.okta_client;
    client_validation_app_category = fallback;
  }

  let clientValidation = await validateClient(
    logger,
    client_id,
    client_redirect,
    dynamoClient,
    config.dynamo_clients_table,
    okta_client,
    client_validation_app_category
  );

  if (!clientValidation.valid) {
    res.status(400).json({
      error: clientValidation.error,
      error_description: clientValidation.error_description,
    });
    return next();
  }

  let paramValidation = checkParameters(state, logger);

  if (!paramValidation.valid) {
    let uri = buildRedirectErrorUri(
      {
        error: paramValidation.error,
        error_description: paramValidation.error_description,
      },
      client_redirect
    );
    return res.redirect(uri.toString());
  }

  let internal_state = uuidv4();
  try {
    let authorizePayload = {
      internal_state: internal_state,
      state: state,
      redirect_uri: client_redirect,
      expires_on: getUnixTime(addMinutes(Date.now(), 10)),
      client_id: client_id,
      proxy:
        config.host + config.well_known_base_path + app_category.api_category,
      aud: app_category.audience,
    };

    // If the launch scope is included then also
    // save the launch context provided (if any)
    if (
      req.query.scope &&
      req.query.scope.split(" ").includes("launch") &&
      req.query.launch
    ) {
      if (!launchValidation(req.query.launch)) {
        res.status(400).json({
          error: "invalid_request",
          error_description:
            "The provided patient launch must be a string or base64 encoded json",
        });
        return next();
      }
      authorizePayload.launch = req.query.launch;
    }

    await dynamoClient.savePayloadToDynamo(
      authorizePayload,
      config.dynamo_oauth_requests_table
    );
  } catch (error) {
    logger.error(
      `Failed to save client redirect URI ${client_redirect} in authorize handler`
    );
    return next(error); // This error is unrecoverable because we can't create a record to lookup the requested redirect
  }

  const params = new URLSearchParams(req.query);
  params.set("client_id", client_id);
  params.set("redirect_uri", rewriteRedirect(config, req, redirect_uri));
  // Rewrite to an internally maintained state
  params.set("state", internal_state);

  // Set the optional IDP (using a preferred order)
  const oktaIdp = slugHelper.rewrite(
    params.get("idp"),
    app_category.idp,
    config.idp
  );
  if (oktaIdp) {
    params.set("idp", oktaIdp);
  }

  res.redirect(
    `${issuer_data.metadata.authorization_endpoint}?${params.toString()}`
  );
};

/**
 *
 * @param {*} state The state parameter that came with the inbound request.
 * @param {*} logger logs information.
 * @returns An object with a "valid" boolean parameter.
 */
const checkParameters = (state, logger) => {
  if (!state) {
    logger.error("No valid state parameter was found.");
    return {
      valid: false,
      error: "invalid_request",
      error_description: "State parameter required",
    };
  }

  return { valid: true };
};

/**
 * Checks for authorization server or local database for valid client.
 *
 * @returns {Promise<{valid: boolean, error?: string, error_description?: string}>}
 */
const validateClient = async (
  logger,
  client_id,
  client_redirect,
  dynamoClient,
  dynamo_clients_table,
  oktaClient,
  app_category
) => {
  if (!client_id || !/^\w+$/.test(client_id)) {
    logger.error("No valid client_id was found.");
    return {
      valid: false,
      error: "unauthorized_client",
      error_description:
        "The client specified by the application is not valid.",
    };
  }

  if (!client_redirect) {
    logger.error("No valid redirect_uri was found.");
    return {
      valid: false,
      error: "invalid_request",
      error_description:
        "There was no redirect URI specified by the application.",
    };
  }

  if (app_category.client_store && app_category.client_store === "local") {
    return await localValidateClient(
      logger,
      client_id,
      client_redirect,
      dynamoClient,
      dynamo_clients_table
    );
  }

  return await serverValidateClient(
    oktaClient,
    logger,
    client_id,
    client_redirect
  );
};

/**
 * Checks for authorization local database for valid client.
 *
 * @returns {Promise<{valid: boolean, error?: string, error_description?: string}>}
 */
const localValidateClient = async (
  logger,
  client_id,
  client_redirect,
  dynamoClient,
  dynamo_clients_table
) => {
  try {
    let clientInfo = await dynamoClient.getPayloadFromDynamo(
      {
        client_id: client_id,
      },
      dynamo_clients_table
    );
    if (clientInfo.Item) {
      clientInfo = clientInfo.Item;
    } else {
      return {
        valid: false,
        error: "unauthorized_client",
        error_description:
          "The client specified by the application is not valid.",
      };
    }
    if (!clientInfo.redirect_uris.values.includes(client_redirect)) {
      return {
        valid: false,
        error: "invalid_request",
        error_description:
          "The redirect URI specified by the application does not match any of the " +
          `registered redirect URIs. Erroneous redirect URI: ${client_redirect}`,
      };
    }
  } catch (err) {
    logger.error("Failed to retrieve client info from Dynamo DB.", err);
    return {
      valid: false,
      error: "unauthorized_client",
      error_description:
        "The client specified by the application is not valid.",
    };
  }
  return { valid: true };
};

/**
 * Checks for authorization server for valid client.
 *
 * @returns {Promise<{valid: boolean, error?: string, error_description?: string}>}
 */
const serverValidateClient = async (
  oktaClient,
  logger,
  client_id,
  client_redirect
) => {
  let oktaApp;
  try {
    oktaApp = await oktaClient.getApplication(client_id);
  } catch (error) {
    // This error is unrecoverable because we would be unable to verify
    // that we are redirecting to a whitelisted client url
    logger.error(
      "Unrecoverable error: could not get the Okta client app",
      error
    );

    return {
      valid: false,
      error: "unauthorized_client",
      error_description:
        "The client specified by the application is not valid.",
    };
  }
  if (
    oktaApp.settings.oauthClient.redirect_uris.indexOf(client_redirect) === -1
  ) {
    return {
      valid: false,
      error: "invalid_request",
      error_description:
        "The redirect URI specified by the application does not match any of the " +
        `registered redirect URIs. Erroneous redirect URI: ${client_redirect}`,
    };
  }
  return { valid: true };
};

/**
 * Builds errors to be sent to client's redirect uri.
 *
 * @returns {module:url.URL}
 */
const buildRedirectErrorUri = (err, redirect_uri) => {
  let uri = new URL(redirect_uri);
  uri.searchParams.append("error", err.error);
  uri.searchParams.append("error_description", err.error_description);
  return uri;
};

module.exports = authorizeHandler;
