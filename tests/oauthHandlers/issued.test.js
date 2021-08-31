"use strict";

require("jest");

const { claimsHandler } = require("../../src/oauthHandlers");
const { hashString } = require("../../src/utils");
const { defaultConfig, mockDynamoClient, mockLogger } = require("../testUtils");
let { beforeEach, describe, it } = global; // ESLint

// Static test config
const token = "token";
const issuer = "issuer";
const dynamoIndex = "oauth_access_token_index";
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

     // I think this can stay
      it("dynamoClient error returns next(error)", async () => {
        const error = { error: "dynamoDb error" };
        dynamoClient = {
          queryFromDynamo: jest.fn(() => {
            throw error;
          }),
        };
    
        await claimsHandler(config, logger, dynamoClient, req, res, next);
        expect(dynamoClient.queryFromDynamo).toHaveBeenCalledWith(
          dynamoQueryParams,
          config.dynamo_oauth_requests_table,
          dynamoIndex
        );
        expect(next).toHaveBeenCalledWith(error);
      });
    
      // I think this can stay
      it("iss not found returns 403", async () => {
        dynamoClient = mockDynamoClient({
          access_token: dynamoQueryParams.access_token,
        });
    
        await claimsHandler(config, logger, dynamoClient, req, res, next);
        expect(dynamoClient.queryFromDynamo).toHaveBeenCalledWith(
          dynamoQueryParams,
          config.dynamo_oauth_requests_table,
          dynamoIndex
        );
        expect(res.sendStatus).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
      });
    
      it("token found", async () => {
        dynamoClient = mockDynamoClient({
          access_token: dynamoQueryParams.access_token,
          iss: issuer,
        });
    
        await claimsHandler(config, logger, dynamoClient, req, res, next);
        expect(dynamoClient.queryFromDynamo).toHaveBeenCalledWith(
          dynamoQueryParams,
          config.dynamo_oauth_requests_table,
          dynamoIndex
        );
        expect(res.json).toHaveBeenCalledWith({ iss: issuer });
        expect(next).toHaveBeenCalledWith();
      });
})

describe("Static Token Flow", () => {
  it("Checksum does not match", () => {

  })

  it("Static token found", () => {
    
  })
})

describe("General Flow", () => {
    it("missing token parameter returns 400 / 401??", async () => {
        req = { body: {} };
    
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
            return { Items: [] };
          }),
        };
    
        await claimsHandler(config, logger, dynamoClient, req, res, next);
        expect(dynamoClient.queryFromDynamo).toHaveBeenCalledWith(
          dynamoQueryParams,
          config.dynamo_oauth_requests_table,
          dynamoIndex
        );
        expect(res.sendStatus).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
      });
})