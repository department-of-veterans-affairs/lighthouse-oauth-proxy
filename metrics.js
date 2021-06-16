const client = require("prom-client");
const { processArgs } = require("./cli");

const defaultLabels = { app: "oauth_proxy" };
client.register.setDefaultLabels(defaultLabels);

const loginBegin = new client.Counter({
  name: "oauth_proxy_login_begin",
  help: "counter of number of times the OAuth login process has begun",
});

const loginEnd = new client.Counter({
  name: "oauth_proxy_login_end",
  help: "counter of number of times the OAuth login process has ended",
});

const oktaTokenRefreshGauge = new client.Gauge({
  name: "oauth_proxy_okta_token_refresh_gauge",
  help: "metric for timing of okta token_refresh flow",
});

const validationGauge = new client.Gauge({
  name: "oauth_proxy_validation_gauge",
  help: "metric for timing of validation flow",
});

function stopTimer(gauge, start) {
  const end = process.hrtime.bigint();
  gauge.set(Number(end - start) / 1000000000);
}

const codeTokenIssueCounter = new client.Counter({
  name: "code_token_issue_counter",
  help: "counter of number access_tokens issued by the code flow.",
});

const refreshTokenIssueCounter = new client.Counter({
  name: "refresh_token_issue_counter",
  help: "counter of number access_tokens issued by the refresh flow.",
});

const clientCredentialsTokenIssueCounter = new client.Counter({
  name: "client_credentials_token_issue_counter",
  help:
    "counter of number access_tokens issued by the client credentials flow.",
});

const refreshTokenLifeCycleHistogram = new client.Histogram({
  name: "refresh_token_life_cycle_histogram",
  help:
    "measures the time in days between a refresh token's instantiation and its use.",
  buckets: processArgs().refresh_histogram_buckets,
});

module.exports = {
  loginBegin,
  loginEnd,
  oktaTokenRefreshGauge,
  validationGauge,
  stopTimer,
  codeTokenIssueCounter,
  refreshTokenIssueCounter,
  clientCredentialsTokenIssueCounter,
  refreshTokenLifeCycleHistogram,
};
