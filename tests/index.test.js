"use strict";
const axios = require("axios");
require("jest");
const { proxyRequest } = require("../src");
const { createFakeConfig, ISSUER_METADATA } = require("./testUtils");
const dynnamoClient = {};
jest.mock("axios");

describe("proxymockin_request tests", () => {
  it("proxymockin_request introspect", async () => {
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
    const in_req = {
      body: { client_id: "client1", token: "token1" },
      headers: { host: "host1" },
    };
    // Don't alter req
    jest.mock("../src/utils", () => {
      jest.fn(() => Promise.resolve(in_req));
    });

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
    let config = createFakeConfig();
    proxyRequest(
      in_req,
      res,
      ISSUER_METADATA,
      "introspection_endpoint",
      "POST",
      config,
      dynnamoClient
    );
  });
});
