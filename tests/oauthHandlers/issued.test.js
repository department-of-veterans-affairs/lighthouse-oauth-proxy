"use strict";

require("jest");

const { issuedRequestHandler } = require("../../src/oauthHandlers");
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
  status: jest.fn(),
  json: jest.fn(() => res),
};
const next = jest.fn();
const logger = mockLogger();

describe("Non Static Token Flow", () => {
  let req;
  let dynamoClient;
  beforeEach(() => {
    req = { headers: { authorization: `Bearer ${token}` } };
    dynamoClient = {};
  });

  it("proxy not found returns 403", async () => {
    dynamoClient = {
      getPayloadFromDynamo: jest.fn().mockReturnValue([]),
      queryFromDynamo: jest.fn().mockReturnValue({
        Items: [
          {
            access_token: dynamoQueryParams.access_token,
          },
        ],
      }),
    };

    await issuedRequestHandler(config, logger, dynamoClient, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("token found", async () => {
    dynamoClient = {
      getPayloadFromDynamo: jest.fn().mockReturnValue([]),
      queryFromDynamo: jest.fn().mockReturnValue({
        Items: [
          {
            access_token: dynamoQueryParams.access_token,
            proxy: "proxy",
            aud: "aud",
          },
        ],
      }),
    };

    await issuedRequestHandler(config, logger, dynamoClient, req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      static: false,
      proxy: "proxy",
      aud: "aud",
    });
    expect(next).toHaveBeenCalledWith();
  });
});

describe("Static Token Flow", () => {
  let req;
  let dynamoClient;
  beforeEach(() => {
    req = { headers: { authorization: `Bearer ${token}` } };
    dynamoClient = {};
    config.enable_static_token_service = true;
  });

  it("Checksum does not match", async () => {
    dynamoClient = {
      getPayloadFromDynamo: jest.fn().mockReturnValue({
        Item: {
          access_token: token,
          refresh_token: "static_refresh",
          icn: "icn",
          checksum: "checksumbad",
          scopes: "scopes",
          expires_in: 1234,
        },
      }),
    };
    await issuedRequestHandler(config, logger, dynamoClient, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("Static token found", async () => {
    dynamoClient = {
      getPayloadFromDynamo: jest.fn().mockReturnValue({
        Item: {
          access_token: token,
          refresh_token: "static_refresh",
          icn: "icn",
          checksum:
            "166a6e4184d814ce811695954744c244e1715285d8fcbdaed827fbb231249d44",
          scopes: "scopes",
          expires_in: 1234,
          aud: "aud",
        },
      }),
    };

    await issuedRequestHandler(config, logger, dynamoClient, req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      static: true,
      scopes: "scopes",
      expires_in: 1234,
      icn: "icn",
      aud: "aud",
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("Static token but not enabled", async () => {
    config.enable_static_token_service = false;
    dynamoClient = {
      getPayloadFromDynamo: jest.fn().mockReturnValue([]),
      queryFromDynamo: jest.fn().mockReturnValue({
        Items: [
          {
            access_token: dynamoQueryParams.access_token,
          },
        ],
      }),
    };

    await issuedRequestHandler(config, logger, dynamoClient, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("General Flow", () => {
  let req;
  let dynamoClient;
  beforeEach(() => {
    req = { headers: { authorization: `Bearer ${token}` } };
    dynamoClient = {};
  });
  it("missing authorization header returns 401", async () => {
    req = {};

    await issuedRequestHandler(config, logger, dynamoClient, req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("missing bearer token returns 401", async () => {
    req = { headers: { authorization: "Bearer " } };

    await issuedRequestHandler(config, logger, dynamoClient, req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("token not found returns 401", async () => {
    dynamoClient = {
      queryFromDynamo: jest.fn().mockReturnValue({}),
      getPayloadFromDynamo: jest.fn().mockReturnValue([]),
    };

    await issuedRequestHandler(config, logger, dynamoClient, req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
