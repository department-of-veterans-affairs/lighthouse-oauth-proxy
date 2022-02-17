"use strict";
const axios = require("axios");
require("jest");
const { proxyRequest } = require("../src");
const { createFakeConfig, ISSUER_METADATA } = require("./testUtils");
const dynnamoClient = {};
jest.mock("axios");
const mock_config = createFakeConfig();
const mock_app_category = mock_config.routes.categories[0];
describe("proxymockin_request tests", () => {
  const mock_in_req = {
    method: "POST",
    url: "http://example.com/introspect",
    headers: {},
    responseType: "stream",
    data: "client_id=clientIdv2",
    path: "/health/v1/introspect",
  };
  jest.mock("../src/utils", () => ({
    v2TransitionProxyRequest: () => Promise.resolve(mock_in_req),
    appCategoryFromPath: () => Promise.resolve(mock_app_category),
  }));
  // Don't alter req config.routes.categories[0];
  it("proxymockin_request introspect", async () => {
    jest.mock("../src/utils", () => ({
      v2TransitionProxyRequest: () => Promise.resolve(mock_in_req),
      appCategoryFromPath: () => Promise.resolve(mock_app_category),
    }));
    const mock_result = {
      active: true,
      scope: "offline_access openid",
      username: "user1",
      exp: 1644943805,
      iat: 1644940205,
      sub: "sub1",
      aud: "api://default",
      iss: "https://deptva-eval.okta.com/oauth2/default",
      jti: "jti1",
      token_type: "Bearer",
      client_id: "client1",
      uid: "uid1",
    };

    const res = {
      _status: "500",
    };
    res.set = (in_headers) => {
      res._headers = in_headers;
    };
    res.status = (in_status) => {
      res._status = in_status;
    };

    const axiosPostPayload = {
      body: mock_result,
      headers: { "Content-type": "application/json" },
      status: "200",
      data: {},
    };

    const promise2check = (res) => {
      return new Promise(
        (resolve) => {
          expect(res._status).toBe("200");
          expect(res.body).toBe(mock_result);
          resolve(true);
        },
        (reject) => {
          reject("Should not be here");
        }
      );
    };
    axiosPostPayload.data.pipe = (targetResp) => {
      targetResp.body = axiosPostPayload.body;
      promise2check(res);
    };
    axios.mockResolvedValueOnce(axiosPostPayload);
    proxyRequest(
      mock_in_req,
      res,
      ISSUER_METADATA,
      "introspection_endpoint",
      "POST",
      mock_config,
      dynnamoClient
    );
  });
  it("proxymockin_request bad", async () => {
    jest.mock("../src/utils", () => ({
      v2TransitionProxyRequest: () => Promise.resolve(mock_in_req),
      appCategoryFromPath: () => mock_app_category,
    }));
    const promise2check404 = (res) => {
      return new Promise(
        (resolve) => {
          expect(res._status).toBe("404");
          expect(res.body).toBe("Bad request");
          resolve(true);
        },
        (reject) => {
          reject("Should not be here");
        }
      );
    };
    const axiosErrorPayloadBad = {
      body: "Bad request",
      headers: { "Content-type": "application/json" },
      status: "404",
      data: {},
    };
    const res = {
      _status: "500",
    };
    res.set = (in_headers) => {
      res._headers = in_headers;
    };
    res.status = (in_status) => {
      res._status = in_status;
    };
    axiosErrorPayloadBad.data.pipe = (targetResp) => {
      targetResp.body = axiosErrorPayloadBad.body;
      promise2check404(res);
    };

    axios.mockRejectedValue({ response: axiosErrorPayloadBad });
    const mock_config = createFakeConfig();

    mock_config.routes.categories[0].fallback = {
      issuer: {
        upstream_issuer:
          "https://deptva-eval.okta.com/oauth2/aus7y0ho1w0bSNLDV2p7",
        manage_endpoint: "https://staging.va.gov/account",
        audience: "https://sandbox-api.va.gov/services/fhir",
        metadata: ISSUER_METADATA,
      },
    };
    proxyRequest(
      mock_in_req,
      res,
      ISSUER_METADATA,
      "introspection_endpoint",
      "POST",
      mock_config,
      dynnamoClient
    );
  });

  it("proxymockin_first request bad so use old issuer", async () => {
    jest.mock("../src/utils", () => ({
      v2TransitionProxyRequest: () => Promise.resolve(mock_in_req),
      appCategoryFromPath: () => mock_app_category,
    }));
    const mock_result = {
      active: true,
      scope: "offline_access openid",
      username: "user1",
      exp: 1644943805,
      iat: 1644940205,
      sub: "sub1",
      aud: "api://default",
      iss: "https://deptva-eval.okta.com/oauth2/default",
      jti: "jti1",
      token_type: "Bearer",
      client_id: "client1",
      uid: "uid1",
    };
    const promise2check = (res) => {
      return new Promise(
        (resolve) => {
          expect(res._status).toBe("200");
          expect(res.body).toBe(mock_result);
          resolve(true);
        },
        (reject) => {
          reject("Should not be here");
        }
      );
    };
    const axiosPostPayload = {
      body: mock_result,
      headers: { "Content-type": "application/json" },
      status: "200",
      data: {},
    };
    const axiosErrorPayload = {
      body: "Bad request",
      headers: { "Content-type": "application/json" },
      status: "404",
      data: {},
    };
    const res = {
      _status: "500",
    };
    res.set = (in_headers) => {
      res._headers = in_headers;
    };
    res.status = (in_status) => {
      res._status = in_status;
    };
    axiosPostPayload.data.pipe = (targetResp) => {
      targetResp.body = axiosPostPayload.body;
      promise2check(res);
    };

    axios.mockRejectedValueOnce({ response: axiosErrorPayload });
    axios.mockResolvedValueOnce(axiosPostPayload);
    const mock_config = createFakeConfig();

    mock_config.routes.categories[0].fallback = {
      issuer: {
        upstream_issuer:
          "https://deptva-eval.okta.com/oauth2/aus7y0ho1w0bSNLDV2p7",
        manage_endpoint: "https://staging.va.gov/account",
        audience: "https://sandbox-api.va.gov/services/fhir",
        metadata: ISSUER_METADATA,
      },
    };
    proxyRequest(
      mock_in_req,
      res,
      ISSUER_METADATA,
      "introspection_endpoint",
      "POST",
      mock_config,
      dynnamoClient
    );
  });
});
