/** @module issuer_helper */
const { Issuer } = require("openid-client");

/**
 * Overrides default metadata endpoints for issuer if necessary.
 *
 * @param {*} upstream_issuer Object of metadata endpoints.
 */

/**
 * Overrides default metadata endpoints for issuer if necessary.
 * @param {*} upstream_issuer The upstream issuer for a given app_category
 * @param {*} custom_metadata The custom metadata for a given app_category
 * @returns an Issuer object
 */
const buildIssuer = async (upstream_issuer, custom_metadata) => {
  let discovered_issuer = await Issuer.discover(upstream_issuer);
  if (custom_metadata) {
    return new Issuer(
      overrideMetadata(custom_metadata, discovered_issuer.metadata)
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

module.exports = { buildIssuer };
