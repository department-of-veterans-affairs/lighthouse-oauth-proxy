/** @module issuer_helper */
const { Issuer } = require("openid-client");

/**
 * Overrides default metadata endpoints for issuer if necessary.
 *
 * @param {*} serviceConfig Object of metadata endpoints.
 */
const buildIssuer = async (serviceConfig) => {
  let discovered_issuer = await Issuer.discover(serviceConfig.upstream_issuer);
  if (serviceConfig.custom_metadata) {
    return new Issuer(
      overrideMetadata(
        serviceConfig.custom_metadata,
        discovered_issuer.metadata
      )
    );
  }
  return discovered_issuer;
};

const overrideMetadata = (serviceConfig, discover_metadata) => {
  Object.entries(serviceConfig).forEach(([key, value]) => {
    if (value) {
      discover_metadata[key] = value;
    }
  });
  return discover_metadata;
};

/**
 * Parses different error responses and returns a common error response.
 *
 * @param {*} error upstream issuer error.
 */
const handleError = (error) => {
  if (!error || !error.response || !error.response.body) {
    throw error;
  }
  let err;
  let error_description;

  if (error.response.body.error) {
    err = error.response.body.error;
    error_description = error.response.body.error_description;
  } else if (error.response.body.errorCode) {
    err = error.response.body.errorCode;
    error_description = error.response.body.errorSummary;
  } else {
    throw error;
  }

  return {
    error: err,
    error_description: error_description,
    statusCode: error.response.statusCode ? error.response.statusCode : 500,
  };
};

module.exports = { buildIssuer, handleError };
