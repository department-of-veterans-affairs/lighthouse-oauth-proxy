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
  let hashedString = hmac.update(unhashedString).digest("hex");
  return hashedString;
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

const addDaysToDate = (date, days) => {
  date.setDate(date.getDate() + days);
  return date;
};

const subtractDaysToDate = (date, days) => {
  date.setDate(date.getDate() - days);
  return date;
};

const secondsToDate = (seconds) => {
  return new Date(seconds * 1000);
};

const dateToSeconds = (date) => {
  return date.getTime() / 1000;
};

const dateDifference = (date1, date2) => {
  let timeDiff = date1.getTime() - date2.getTime();
  return Math.round(timeDiff / (1000 * 3600 * 24));
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
  addDaysToDate,
  subtractDaysToDate,
  secondsToDate,
  dateToSeconds,
  dateDifference,
};
