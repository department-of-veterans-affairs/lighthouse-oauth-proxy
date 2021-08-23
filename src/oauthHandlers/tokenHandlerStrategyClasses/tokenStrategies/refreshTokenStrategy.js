const process = require("process");
const {
  rethrowIfRuntimeError,
  minimalError,
  handleOpenIdClientError,
} = require("../../../utils");
const { oktaTokenRefreshGauge, stopTimer } = require("../../../metrics");

class RefreshTokenStrategy {
  constructor(req, logger, client) {
    this.req = req;
    this.logger = logger;
    this.client = client;
  }

  //will throw error if cannot retrieve refresh token
  async getToken() {
    let oktaTokenRefreshStart = process.hrtime.bigint();
    let tokens;

    try {
      tokens = await this.client.refresh(this.req.body.refresh_token);
    } catch (error) {
      rethrowIfRuntimeError(error);
      let handledError = handleOpenIdClientError(error);
      this.logger.error(
        "Could not refresh the client session with the provided refresh token",
        minimalError(handledError)
      );
      stopTimer(oktaTokenRefreshGauge, oktaTokenRefreshStart);
      throw handledError;
    }

    stopTimer(oktaTokenRefreshGauge, oktaTokenRefreshStart);
    return tokens;
  }
}

module.exports = { RefreshTokenStrategy };
