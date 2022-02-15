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
 * @param {} path The path for the token request
 * @param {*} categories  Array of the app config route categories
 * @returns The the appropriate app category object from the app config
 */
const apiCategoryFromPath = (path_orig, routes) => {
  let app_category;
  const path = path_orig.endsWith("/")
    ? path_orig.slice(0, path_orig.lastIndexOf("/"))
    : path_orig;
  if (
    path &&
    routes &&
    routes.categories &&
    routes.app_routes &&
    (path.endsWith(routes.app_routes.token) ||
      path.endsWith(routes.app_routes.authorize) ||
      path.endsWith(routes.app_routes.introspection) ||
      path.endsWith(routes.app_routes.revoke))
  ) {
    const category = path.substring(0, path.lastIndexOf("/"));
    app_category = routes.categories.find(
      (appCategory) => appCategory.api_category === category
    );
  }
  return app_category;
};

/**
 * Screens client_id and replaces with v2 equivant if applicable for the route
 * @param {*} client_id The incocming client_id
 * @param {*} dynamoClient The dynamo client
 * @param {*} config The app config
 * @param {*} path  The path in the request
 * @returns Either the original client ID or the v2 variant of it
 */
const screenForV2ClientId = async (client_id, dynamoClient, config, path) => {
  let v2transitiondata = { client_id: client_id };
  const apiCategory =
    config && config.routes ? apiCategoryFromPath(path, config.routes) : null;
  if (apiCategory && apiCategory.old && apiCategory.old.upstream_issuer) {
    try {
      const dynamo_clients_table = config.dynamo_clients_table;
      let clientInfo = await dynamoClient.getPayloadFromDynamo(
        {
          client_id: v2transitiondata.client_id,
        },
        dynamo_clients_table
      );
      if (clientInfo.Item) {
        v2transitiondata.client_id = clientInfo.Item.v2_client_id
          ? clientInfo.Item.v2_client_id
          : client_id;
      }
    } catch (err) {
      // No client entry
    }
  }
  if (v2transitiondata.client_id === client_id) {
    v2transitiondata.old = apiCategory.old;
  }
  return v2transitiondata;
};

/**
 * Rewrites the client in the request
 * @param {*} req The request
 * @param {*} dynamoClient The dynamo client
 * @param {*} config The app configuration
 * @returns The the request, modified or unchanged
 */
const reqClientRewrite = async (req, dynamoClient, config) => {
  let creds = parseBasicAuth(req);
  let v2transitiondata = {};
  if (creds) {
    v2transitiondata = await screenForV2ClientId(
      creds.username,
      dynamoClient,
      config,
      req.path
    );
    req.headers.authorization = encodeBasicAuthHeader(
      v2transitiondata.client_id,
      creds.password
    );
  } else if (req.body && req.body.client_id) {
    v2transitiondata = await screenForV2ClientId(
      req.body.client_id,
      dynamoClient,
      config,
      req.path
    );
    req.body.client_id = v2transitiondata.client_id;
  }
  req.old = v2transitiondata.old;
  return req;
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
  apiCategoryFromPath,
  reqClientRewrite,
};
