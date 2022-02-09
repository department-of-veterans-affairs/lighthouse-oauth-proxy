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
 * Determine the api_catory based on the path
 * @param {} path The path for the token request
 * @param {*} categories  Array of the app config route categories
 * @returns The api_catory object from the app config
 */
const apiCategoryFromPath = (path, categories) => {
  let app_category;
  if (path && categories && path.endsWith("/token")) {
    const category = path.substring(0, path.indexOf("/token"));
    app_category = categories.find(
      (apiCatetory) => apiCatetory.api_category === category
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
  let clientId = client_id;
  const apiCategory =
    config && config.routes
      ? apiCategoryFromPath(path, config.routes.categories)
      : null;
  if (apiCategory && apiCategory.enable_client_id_transition) {
    try {
      const dynamo_clients_table = config.dynamo_clients_table;
      let clientInfo = await dynamoClient.getPayloadFromDynamo(
        {
          client_id: client_id,
        },
        dynamo_clients_table
      );
      if (clientInfo.Item) {
        clientId = clientInfo.Item.v2_client_id
          ? clientInfo.Item.v2_client_id
          : client_id;
      }
    } catch (err) {
      // No client entry
    }
  }
  return clientId;
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
};
