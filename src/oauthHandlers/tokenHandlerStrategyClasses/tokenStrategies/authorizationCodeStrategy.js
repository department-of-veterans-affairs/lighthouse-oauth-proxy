const { rethrowIfRuntimeError, minimalError } = require("../../../utils");
const { handleError } = require("../../../issuer_helper");

class AuthorizationCodeStrategy {
  constructor(req, logger, redirect_uri, client) {
    this.req = req;
    this.logger = logger;
    this.redirect_uri = redirect_uri;
    this.client = client;
  }

  //will throw error if cannot retrieve refresh token
  async getToken() {
    let token;
    try {
      token = await this.client.grant({
        ...this.req.body,
        redirect_uri: this.redirect_uri,
      });
    } catch (error) {
      rethrowIfRuntimeError(error);
      let handledError = handleError(error);
      this.logger.error(
        "Failed to retrieve tokens using the OpenID client",
        minimalError(handledError)
      );
      throw handledError;
    }
    return token;
  }
}

module.exports = { AuthorizationCodeStrategy };
