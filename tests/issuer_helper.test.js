"use strict";

require("jest");
const { createFakeConfig, ISSUER_METADATA } = require("./testUtils");
const { buildIssuer, handleError } = require("../src/issuer_helper");
const { Issuer } = require("openid-client");
const { fail } = require("yargs");

describe("happy paths buildIssuer tests", () => {
  let config;

  beforeEach(() => {
    config = createFakeConfig();
    let mockDiscover = jest.fn();
    mockDiscover.mockImplementation(() => {
      return {
        metadata: ISSUER_METADATA,
      };
    });
    Issuer.discover = mockDiscover;
  });

  it("Happy Path no custom endpoints", async () => {
    let category = config.routes.categories.find(
      (category) => category.api_category == "/health/v1"
    );
    let issuer = await buildIssuer(category);
    expect(issuer.metadata.authorization_endpoint).toEqual(
      ISSUER_METADATA.authorization_endpoint
    );
    expect(issuer.metadata.token_endpoint).toEqual(
      ISSUER_METADATA.token_endpoint
    );
    expect(issuer.metadata.userinfo_endpoint).toEqual(
      ISSUER_METADATA.userinfo_endpoint
    );
    expect(issuer.metadata.introspection_endpoint).toEqual(
      ISSUER_METADATA.introspection_endpoint
    );
    expect(issuer.metadata.revocation_endpoint).toEqual(
      ISSUER_METADATA.revocation_endpoint
    );
    expect(issuer.metadata.jwks_uri).toEqual(ISSUER_METADATA.jwks_uri);
    expect(issuer.metadata.issuer).toEqual(ISSUER_METADATA.issuer);
  });

  it("Happy Path all custom endpoints", async () => {
    let category = config.routes.categories.find(
      (category) => category.api_category == "/overrideEndpoints"
    );
    let issuer = await buildIssuer(category);

    expect(issuer.metadata.authorization_endpoint).toEqual(
      category.custom_metadata.authorization_endpoint
    );
    expect(issuer.metadata.token_endpoint).toEqual(
      category.custom_metadata.token_endpoint
    );
    expect(issuer.metadata.userinfo_endpoint).toEqual(
      category.custom_metadata.userinfo_endpoint
    );
    expect(issuer.metadata.introspection_endpoint).toEqual(
      category.custom_metadata.introspection_endpoint
    );
    expect(issuer.metadata.revocation_endpoint).toEqual(
      category.custom_metadata.revocation_endpoint
    );
    expect(issuer.metadata.jwks_uri).toEqual(category.custom_metadata.jwks_uri);
    expect(issuer.metadata.issuer).toEqual(category.custom_metadata.issuer);
  });
});

describe("handleError tests", () => {
  it("Happy path error_description structure", async () => {
    const error = {
      response: {
        body: {
          error: "client error",
          error_description: "this is a client error",
        },
        statusCode: 400,
      },
    };

    let handledError = handleError(error);
    expect(handledError.error).toEqual("client error");
    expect(handledError.error_description).toEqual("this is a client error");
    expect(handledError.statusCode).toEqual(400);
  });

  it("Happy path errorSummary structure", async () => {
    const error = {
      response: {
        body: {
          errorCode: "client error",
          errorSummary: "this is a client error",
        },
        statusCode: 400,
      },
    };
    let handledError = handleError(error);
    expect(handledError.error).toEqual("client error");
    expect(handledError.error_description).toEqual("this is a client error");
    expect(handledError.statusCode).toEqual(400);
  });

  it("Happy path no statusCode", async () => {
    const error = {
      response: {
        body: {
          errorCode: "client error",
          errorSummary: "this is a client error",
        },
      },
    };
    let handledError = handleError(error);
    expect(handledError.error).toEqual("client error");
    expect(handledError.error_description).toEqual("this is a client error");
    expect(handledError.statusCode).toEqual(500);
  });

  it("no response in error", async () => {
    const error = {
      badStructure: "this error is not known by the handleError method",
    };
    try {
      handleError(error);
      fail("should throw an error");
    } catch (err) {
      expect(err).toEqual(error);
    }
  });

  it("no body in error", async () => {
    const error = {
      response: {
        badStructure: "this error is not known by the handleError method",
      },
    };
    try {
      handleError(error);
      fail("should throw an error");
    } catch (err) {
      expect(err).toEqual(error);
    }
  });

  it("Unknown error body structure", async () => {
    const error = {
      response: {
        body: {
          badCode: "client error",
          badSummary: "this is a client error",
        },
      },
    };
    try {
      handleError(error);
      fail("should throw an error");
    } catch (err) {
      expect(err).toEqual(error);
    }
  });
});
