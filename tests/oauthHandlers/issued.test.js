"use strict";

require("jest");

const { claimsHandler } = require("../../src/oauthHandlers");
const { hashString } = require("../../src/utils");
const { defaultConfig, mockLogger } = require("../testUtils");
let { beforeEach, describe, it } = global; // ESLint

const token = "token";
const config = defaultConfig();
const dynamoQueryParams = {
  access_token: hashString(token, config.hmac_secret),
};

// Static mocks
const res = {
  sendStatus: jest.fn(),
  status: jest.fn(() => res),
  json: jest.fn(() => res),
};
const next = jest.fn();
const logger = mockLogger();

describe("Non Static Token Flow", () => {
  let req;
  let dynamoClient;
  beforeEach(() => {
    req = { body: { token: token } };
    dynamoClient = {};
  });

  it("iss not found returns 403", async () => {
    fail("Maybe there will be another path?");
  });

  it("token found", async () => {
    dynamoClient = {
      getPayloadFromDynamo: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({
          Items: [
            {
              access_token: dynamoQueryParams.access_token,
              proxy: "proxy",
            },
          ],
        }),
    };

    await claimsHandler(config, logger, dynamoClient, req, res, next);
    expect(res.json).toHaveBeenCalledWith({ static: false, proxy: "proxy" });
    expect(next).toHaveBeenCalledWith();
  });
});

describe("Static Token Flow", () => {
  let req;
  let dynamoClient;
  beforeEach(() => {
    req = { body: { token: token } };
    dynamoClient = {};
  });

  it("Checksum does not match", async () => {
    dynamoClient = {
      getPayloadFromDynamo: jest
        .fn()
        .mockReturnValueOnce({
          Items: [
            {
              access_token: dynamoQueryParams.access_token,
              refresh_token: "static_refresh",
              icn: "icn",
              checksum: "checksum",
              scopes: "scopes",
              expires_in: 1234,
            },
          ],
        })
        .mockReturnValueOnce(null),
    };
    await claimsHandler(config, logger, dynamoClient, req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
  });

  it("Static token found", async () => {
    dynamoClient = {
      getPayloadFromDynamo: jest
        .fn()
        .mockReturnValueOnce({
          Items: [
            {
              access_token: dynamoQueryParams.access_token,
              refresh_token: "static_refresh",
              icn: "icn",
              checksum: "checksum",
              scopes: "scopes",
              expires_in: 1234,
            },
          ],
        })
        .mockReturnValueOnce(null),
    };
    await claimsHandler(config, logger, dynamoClient, req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      static: true,
      scopes: "scopes",
      expires_in: 1234,
      icn: "icn",
      aud: "aud",
    });
    expect(next).toHaveBeenCalledWith();
  });
});

describe("General Flow", () => {
  let req;
  let dynamoClient;
  beforeEach(() => {
    req = { body: { token: token } };
    dynamoClient = {};
  });
  it("missing token parameter returns 400 / 401??", async () => {
    req = {};

    await claimsHandler(config, logger, dynamoClient, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "invalid_request",
      error_description: "Missing parameter: token",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("token not found returns 403", async () => {
    dynamoClient = {
      queryFromDynamo: jest.fn(() => {
        return null;
      }),
    };

    await claimsHandler(config, logger, dynamoClient, req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
