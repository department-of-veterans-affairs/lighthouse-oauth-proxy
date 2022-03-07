const crypto = require("crypto");

const bearerAuthorizationRegex = /^Bearer\s([^\s]+)$/;

function statusCodeFromError(error) {
  if (error.response && error.response.statusCode) {
    return error.response.statusCode;
  }
  return 500;
}

const isRuntimeError = (err) => {
  return (
    err instanceof EvalError ||
    err instanceof ReferenceError ||
    err instanceof RangeError ||
    err instanceof SyntaxError ||
    err instanceof TypeError
  );
};

const rethrowIfRuntimeError = (err) => {
  if (isRuntimeError(err)) {
    throw err;
  }
};

function encodeBasicAuthHeader(username, password) {
  const encodedCredentials = Buffer.from(`${username}:${password}`).toString(
    "base64"
  );
  return `Basic ${encodedCredentials}`;
}

const BASIC_AUTH_REGEX = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9._~+/-]+=*) *$/;
const USER_PASS_REGEX = /^([^:]*):(.*)$/;

function parseBasicAuth(req) {
  if (!req || typeof req !== "object") {
    return undefined;
  }

  if (!req.headers || typeof req.headers !== "object") {
    return undefined;
  }

  if (typeof req.headers.authorization !== "string") {
    return undefined;
  }

  const match = BASIC_AUTH_REGEX.exec(req.headers.authorization);
  if (!match) {
    return undefined;
  }

  const userPass = USER_PASS_REGEX.exec(
    Buffer.from(match[1], "base64").toString("utf-8")
  );
  if (!userPass) {
    return undefined;
  }

  return new Credentials(userPass[1], userPass[2]);
}

function Credentials(username, password) {
  this.username = username;
  this.password = password;
}

function parseClientId(clientId) {
  const regex = /^[A-Za-z0-9]+$/;
  return regex.test(clientId);
}

const hashString = (unhashedString, secret) => {
  const hmac = crypto.createHmac("sha256", secret);
  return hmac.update(unhashedString).digest("hex");
};

const isString = (obj) => typeof obj === "string" || obj instanceof String;

const minimalError = (error) => {
  if (isString(error)) {
    return error;
  }
  let errPayload = {};
  if (error.error && isString(error.error)) {
    errPayload.error = error.error;
  }
  if (error.message) {
    errPayload.message = error.message;
  }
  if (error.name) {
    errPayload.name = error.name;
  }
  if (error.statusCode) {
    errPayload.statusCode = error.statusCode;
  }
  if (error.error_description) {
    errPayload.error_description = error.error_description;
  }
  if (error.status) {
    errPayload.status = error.status;
  }

  return errPayload;
};

function parseBearerAuthorization(authorization) {
  if (!authorization) {
    return null;
  }

  let match = bearerAuthorizationRegex.exec(authorization);

  if (!match) {
    return null;
  }

  return match[1];
}

/**
 * Parses different error responses and returns a common error response.
 *
 * @param {*} error upstream issuer error.
 */
const handleOpenIdClientError = (error) => {
  if (!error || !error.response || !error.response.body) {
    throw error;
  }
  let handledError;
  let error_description;

  if (error.response.body.error) {
    handledError = error.response.body.error;
    error_description = error.response.body.error_description;
  } else if (error.response.body.errorCode) {
    handledError = error.response.body.errorCode;
    error_description = error.response.body.errorSummary;
  } else {
    throw error;
  }

  return {
    error: handledError,
    error_description: error_description,
    statusCode: error.response.statusCode ? error.response.statusCode : 500,
  };
};

/**
 * Determine the app category based on the path
 *
 * @param {string} path path for the token request.
 * @param {*} categories array of the app config route categories.
 * @returns The the appropriate app category object from the app config.
 */
const appCategoryFromPath = (path, routes) => {
  let app_category;

  if (path && routes && routes.categories) {
    const category = path.substring(0, path.lastIndexOf("/"));
    app_category = routes.categories.find(
      (appCategory) => appCategory.api_category === category
    );
  }
  return app_category;
};

/**
 * Screens the client id and replaces it with its version 2 equivalent if applicable.
 *
 * @param {string} client_id client id to screen for version 2 equivalent
 * @param {DynamoClient} dynamoClient interacts with dynamodb.
 * @param {*} config application configuration.
 * @param {string} path  path in the request.
 * @returns An object with either the original client ID or its version 2 equivalent,
 *  as well as an object with old issuer app_category data when there is no version 2 client id.
 */
const screenForV2ClientId = async (client_id, dynamoClient, config, path) => {
  let v2transitional = { client_id: client_id };
  const apiCategory =
    config && config.routes ? appCategoryFromPath(path, config.routes) : null;
  if (
    apiCategory &&
    apiCategory.fallback &&
    apiCategory.fallback.upstream_issuer
  ) {
    try {
      const dynamo_clients_table = config.dynamo_clients_table;
      let clientInfo = await dynamoClient.getPayloadFromDynamo(
        {
          client_id: client_id,
        },
        dynamo_clients_table
      );
      if (clientInfo.Item) {
        // This client is not translated and is current with this app category
        if (clientInfo.Item.v2_client_id) {
          v2transitional.client_id = clientInfo.Item.v2_client_id;
        }
        // Do not use fallback in this case
        return v2transitional;
      }
    } catch (err) {
      // No client entry
    }
  }
  if (
    v2transitional.client_id === client_id &&
    apiCategory &&
    apiCategory.fallback
  ) {
    v2transitional.fallback = apiCategory.fallback;
  }
  return v2transitional;
};

/**
 * Generates a request object used for an axios request
 *
 * @param {express.Request} req req express request object.
 * @param {DynamoClient} dynamoClient interacts with dynamodb.
 * @param {*} config application configuration.
 * @param {*} issuer_metadata metadata for an issuer, for example, the URL to the introspection endpoint for an issuer.
 * @param {*} metadata_type metadata type such as 'introspect' or 'revoke'
 * @param {string} requestMethod The HTTP request method, eg. 'POST' or 'GET'
 * @param {StringifyOptions} bodyEncoder encodes a string for the body
 * @returns An object used for an axios request
 */
const v2TransitionProxyRequest = async (
  req,
  dynamoClient,
  config,
  issuer_metadata,
  metadata_type,
  requestMethod,
  bodyEncoder
) => {
  delete req.headers.host;
  let v2TransitionData = {};
  let destinationUrl = issuer_metadata[metadata_type];
  if (req.body && req.body.client_id) {
    v2TransitionData = await screenForV2ClientId(
      req.body.client_id,
      dynamoClient,
      config,
      req.path
    );
    // Since there is no distinct v2 client id proxy to the appropriate fallback url
    if (
      req.body.client_id === v2TransitionData.client_id &&
      v2TransitionData.fallback
    ) {
      destinationUrl = v2TransitionData.fallback.issuer.metadata[metadata_type];
    } else {
      req.body.client_id = v2TransitionData.client_id;
    }
  }
  req.destinationUrl = destinationUrl;
  let proxy_request = {
    method: requestMethod,
    url: destinationUrl,
    headers: req.headers,
    responseType: "stream",
  };

  /*
   * Build the proxied request body.
   *
   * Use the original request body and optionally encode it.
   *
   * If resulting body is empty, omit it from the proxied request.
   */

  let payload = req.body;

  if (bodyEncoder !== undefined) {
    payload = bodyEncoder.stringify(req.body);
  }

  if (payload && Object.keys(payload).length) {
    proxy_request.data = payload;
  }
  return proxy_request;
};

/**
 * Screens a launch value and returns its decoded value, otherwise return an error.
 *
 * @param { string } launch The base64-encoded launch value
 * @returns Object as the decoded launch entries or an error result
 */
const decodeBase64Launch = (launch) => {
  try {
    let decodedLaunch = JSON.parse(
      Buffer.from(launch, "base64").toString("ascii")
    );
    return decodedLaunch;
  } catch (error) {
    // launch is assumed to be a b64 encoded json structure
    const errorPayload = {
      message: "The launch parameter was not base64-encoded",
      cause: minimalError(error),
    };
    return {
      isError: true,
      errorPayload: errorPayload,
    };
  }
};

module.exports = {
  isRuntimeError,
  rethrowIfRuntimeError,
  statusCodeFromError,
  encodeBasicAuthHeader,
  parseBasicAuth,
  parseClientId,
  hashString,
  parseBearerAuthorization,
  minimalError,
  handleOpenIdClientError,
  screenForV2ClientId,
  appCategoryFromPath,
  v2TransitionProxyRequest,
  decodeBase64Launch,
};
