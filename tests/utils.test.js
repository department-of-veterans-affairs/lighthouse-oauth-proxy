"use strict";
const querystring = require("querystring");
require("jest");
const { ISSUER_METADATA } = require("./testUtils");

const {
  statusCodeFromError,
  parseBasicAuth,
  parseClientId,
  parseBearerAuthorization,
  hashString,
  minimalError,
  handleOpenIdClientError,
  screenForV2ClientId,
  appCategoryFromPath,
  v2TransitionProxyRequest,
  validateBase64Encoding,
  validateBase64EncodedJson,
  decodeBase64Launch,
} = require("../src/utils");

describe("statusCodeFromError", () => {
  describe("returns the default", () => {
    it("if response is undefined", () => {
      expect(statusCodeFromError({})).toEqual(500);
    });

    it("if response.statusCode is undefined", () => {
      expect(statusCodeFromError({ response: {} })).toEqual(500);
    });
  });

  it("returns the value in response.statusCode if defined", () => {
    expect(statusCodeFromError({ response: { statusCode: 404 } })).toEqual(404);
  });
});

describe("parseBasicAuth", () => {
  describe("undefined", () => {
    it("missing request returns undefined", () => {
      expect(parseBasicAuth()).toEqual(undefined);
    });

    it("invalid request type returns undefined", () => {
      expect(parseBasicAuth("request")).toEqual(undefined);
    });

    it("empty request returns undefined", () => {
      expect(parseBasicAuth({})).toEqual(undefined);
    });

    it("invalid headers type returns undefined", () => {
      expect(parseBasicAuth({ headers: "headers" })).toEqual(undefined);
    });

    it("empty headers returns undefined", () => {
      expect(parseBasicAuth({ headers: {} })).toEqual(undefined);
    });

    it("invalid authorization type returns undefined", () => {
      expect(parseBasicAuth({ headers: { authorization: {} } })).toEqual(
        undefined
      );
    });

    it("invalid authorization returns undefined", () => {
      expect(parseBasicAuth({ headers: { authorization: "Basic " } })).toEqual(
        undefined
      );
    });

    it("invalid username password returns undefined", () => {
      let usernamePassword = Buffer.from("user1").toString("base64");
      expect(
        parseBasicAuth({
          headers: { authorization: `Basic ${usernamePassword}` },
        })
      ).toEqual(undefined);
    });
  });

  it("valid username password returns undefined", () => {
    let usernamePassword = Buffer.from("user1:pass1").toString("base64");
    let credentials = parseBasicAuth({
      headers: { authorization: `Basic ${usernamePassword}` },
    });
    expect(credentials.username).toEqual("user1");
    expect(credentials.password).toEqual("pass1");
  });

  it("hashString", () => {
    let unhashedString = "this_is_the_string_to_be_hashed";
    let expectedHashString =
      "b8006bab9baf73277873c694f0d37b7a04e372cb0575720fd5a3fa1dcb4d62aa";
    let actualHashString = hashString(unhashedString, "secret");
    expect(expectedHashString).toEqual(actualHashString);
  });
});

describe("parseClientId", () => {
  const validClientId = "1";
  const specialCharacters = [
    " ",
    "`",
    "~",
    "!",
    "@",
    "#",
    "$",
    "$",
    "%",
    "^",
    "&",
    "*",
    "(",
    ")",
    "-",
    "_",
    "=",
    "+",
    "[",
    "{",
    "]",
    "}",
    "\\",
    "|",
    ";",
    ":",
    "'",
    '"',
    ",",
    "<",
    ".",
    ">",
    "/",
    "?",
  ];
  it("Valid Client Id", () => {
    let result = parseClientId(validClientId);
    expect(result).toEqual(true);
  });

  it("Query Client Id", () => {
    let clientId = "?q=name";
    let result = parseClientId(clientId);
    expect(result).toEqual(false);
  });

  it("Filter Client Id", () => {
    let clientId = '?filter=client_name eq "name"';
    let result = parseClientId(clientId);
    expect(result).toEqual(false);
  });

  it("Special Characters", () => {
    specialCharacters.forEach((specialCharacter) => {
      let clientId = validClientId + specialCharacter;
      let result = parseClientId(clientId);
      expect(result).toEqual(false);
    });
  });
});

describe("parseBearerAuthorization", () => {
  it("undefined", () => {
    expect(parseBearerAuthorization()).toBe(null);
  });
  it("Unmatched regex 1", () => {
    expect(parseBearerAuthorization("ABC")).toBe(null);
  });
  it("Unmatched regex 2", () => {
    expect(parseBearerAuthorization("Bearer")).toBe(null);
  });
  it("Unmatched regex 3", () => {
    expect(parseBearerAuthorization("Bearer a b")).toBe(null);
  });
  it("Match", () => {
    expect(parseBearerAuthorization("Bearer jwt")).toBe("jwt");
  });
});

describe("minimalError", () => {
  it("API-3493 verbose log on timeout fix verification", () => {
    let testError = {
      name: "TimeoutError",
      code: "ETIMEDOUT",
      hostname: "deptva-eval.okta.com",
      method: "POST",
      url: "https://xxx/oauth2/xxxxxx/v1/token",
      event: "request",
      level: "error",
      message:
        "Failed to retrieve tokens using the OpenID client Timeout awaiting 'request' for 10000ms",
      time: "2020-12-08T18:54:51.085Z",
    };
    let result = minimalError(testError);
    expect(result.message).toBe(
      "Failed to retrieve tokens using the OpenID client Timeout awaiting 'request' for 10000ms"
    );
    expect(result.name).toBe("TimeoutError");
    expect(Object.keys(result)).toHaveLength(2);
  });
  it("pass through error as a string", () => {
    expect(minimalError("Some error")).toBe("Some error");
  });

  it("verify whitelist of other fields", () => {
    let testErr = {
      statusCode: 500,
      error: "ut_token_failure",
      error_description: "Failed to retrieve access_token.",
      status: "Internal server error",
    };
    let result = minimalError(testErr);
    expect(result.statusCode).toBe(500);
    expect(result.status).toBe("Internal server error");
    expect(result.error).toBe("ut_token_failure");
    expect(result.error_description).toBe("Failed to retrieve access_token.");
  });
});

describe("handleOpenIdClientError tests", () => {
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

    let handledError = handleOpenIdClientError(error);
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
    let handledError = handleOpenIdClientError(error);
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
    let handledError = handleOpenIdClientError(error);
    expect(handledError.error).toEqual("client error");
    expect(handledError.error_description).toEqual("this is a client error");
    expect(handledError.statusCode).toEqual(500);
  });

  it("no response in error", async () => {
    const error = {
      badStructure:
        "this error is not known by the handleOpenIdClientError method",
    };
    try {
      handleOpenIdClientError(error);
      fail("should throw an error");
    } catch (err) {
      expect(err).toEqual(error);
    }
  });

  it("no body in error", async () => {
    const error = {
      response: {
        badStructure:
          "this error is not known by the handleOpenIdClientError method",
      },
    };
    try {
      handleOpenIdClientError(error);
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
      handleOpenIdClientError(error);
      fail("should throw an error");
    } catch (err) {
      expect(err).toEqual(error);
    }
  });
});
const categories = [
  {
    api_category: "",
    audience: "api://default",
  },
  {
    api_category: "/claims/v1",
    audience: "api://default",
  },
  {
    api_category: "/community-care/v1",
    audience: "api://default",
    fallback: { upstream_issuer: "http://whatever" },
  },
  {
    api_category: "/health/v1",
    audience: "api://default",
  },
];
const app_routes = {
  authorize: "/authorization",
  token: "/token",
  userinfo: "/userinfo",
  introspection: "/introspect",
  manage: "/manage",
  revoke: "/revoke",
  jwks: "/keys",
  issued: "/issued",
  grants: "/grants",
  smart_launch: "/smart/launch",
  redirect: "/redirect",
  claims: "/claims",
};

const config = { routes: { categories: categories, app_routes: app_routes } };

describe("screenForV2ClientId tests", () => {
  const dynamoClient = {};
  dynamoClient.getPayloadFromDynamo = jest.fn();
  it("screenForV2ClientId happy v2", async () => {
    const v2val = { Item: { v2_client_id: "clientIdv2" } };
    dynamoClient.getPayloadFromDynamo.mockReturnValue(v2val);
    const result = await screenForV2ClientId(
      "clientId",
      dynamoClient,
      config,
      "/community-care/v1/token"
    );
    expect(result.client_id).toBe("clientIdv2");
  });
  it("screenForV2ClientId happy v1 2", async () => {
    let v2val = {};
    dynamoClient.getPayloadFromDynamo.mockReturnValue(v2val);
    let result = await screenForV2ClientId(
      "clientId",
      dynamoClient,
      config,
      "/community-care/v1/token"
    );
    expect(result.client_id).toBe("clientId");
    v2val = { Item: { something: "xxxx" } };
    dynamoClient.getPayloadFromDynamo.mockReturnValue(v2val);
    result = await screenForV2ClientId(
      "clientId",
      dynamoClient,
      config,
      "/community-care/v1/token"
    );
    expect(result.client_id).toBe("clientId");
  });
  it("screenForV2ClientId mapping not applicable", async () => {
    const v2val = { Item: { v2_client_id: "clientIdv2" } };
    dynamoClient.getPayloadFromDynamo.mockReturnValue(v2val);
    const result = await screenForV2ClientId(
      "clientId",
      dynamoClient,
      config,
      "/health/v1/token"
    );
    expect(result.client_id).toBe("clientId");
  });
});

describe("appCategoryFromPath tests", () => {
  it("appCategoryFromPath /health/v1", async () => {
    let result = appCategoryFromPath("/health/v1/token", config.routes);
    expect(result.api_category).toBe("/health/v1");
    result = appCategoryFromPath("/health/v1/authorization", config.routes);
    expect(result.api_category).toBe("/health/v1");
  });

  it("appCategoryFromPath default", async () => {
    const result = appCategoryFromPath("/token", config.routes);
    expect(result.api_category).toBe("");
  });

  it("appCategoryFromPath not found", async () => {
    const result = appCategoryFromPath("/nothere/v0/token", config.routes);
    expect(result).toBe(undefined);
  });
});

describe("v2TransitionProxyRequest tests", () => {
  const dynamoClient = {};
  dynamoClient.getPayloadFromDynamo = jest.fn();
  it("v2TransitionProxyRequest positive rewrite client body", async () => {
    const v2val = { Item: { v2_client_id: "clientIdv2" } };
    dynamoClient.getPayloadFromDynamo.mockReturnValue(v2val);
    const req = {
      headers: { host: "localhost" },
      body: { client_id: "testClient2" },
      path: "/community-care/v1/introspect",
    };
    const result = await v2TransitionProxyRequest(
      req,
      dynamoClient,
      config,
      ISSUER_METADATA,
      "introspection_endpoint",
      "POST",
      querystring
    );
    expect(result.data).toBe("client_id=clientIdv2");
    expect(result.url).toBe("http://example.com/introspect");
  });
});

describe("decodeBase64Launch tests", () => {
  it("decodeBase64Launch happy", async () => {
    const payload =
      "ewogICJwYXRpZW50IjogIjEyMzRWNTY3OCIsCiAgImVuY291bnRlciI6ICI5ODc2LTU0MzItMTAwMCIKfQ==";
    const result = decodeBase64Launch(payload);
    expect(result.patient).toBe("1234V5678");
    expect(result.encounter).toBe("9876-5432-1000");
  });
  it("decodeBase64Launch invalid", async () => {
    const payload = "bad encoding";
    try {
      decodeBase64Launch(payload);
      expect(false).toBe(true); //should not reach here.
    } catch (err) {
      expect(err.message).toBe("Error evaluating launch");
    }
  });
  it("decodeBase64Launch EvalError", async () => {
    const payload = "VG90YWxseSBub3QganNvbg==";
    try {
      decodeBase64Launch(payload);
      expect(false).toBe(true); //should not reach here.
    } catch (err) {
      expect(err.message).toBe("Error evaluating launch");
    }
  });
});

describe("validateBase64EncodedJson tests", () => {
  it("validateBase64EncodedJson valid", async () => {
    const payload =
      "ewogICJwYXRpZW50IjogIjEyMzRWNTY3OCIsCiAgImVuY291bnRlciI6ICI5ODc2LTU0MzItMTAwMCIKfQ==";
    const result = validateBase64EncodedJson(payload);
    expect(result.valid).toBe(true);
  });
  it("validateBase64EncodedJson invalid", async () => {
    const payload = "bad encoding";
    const result = validateBase64EncodedJson(payload);
    expect(result.valid).toBe(false);
  });
  it("validateBase64EncodedJson invalid not json", async () => {
    const payload = "VG90YWxseSBub3QganNvbg==";
    const result = validateBase64EncodedJson(payload);
    expect(result.valid).toBe(false);
  });
});

describe("validateBase64Encoding tests", () => {
  it("validateBase64Encoding valid", async () => {
    const payload =
      "ewogICJwYXRpZW50IjogIjEyMzRWNTY3OCIsCiAgImVuY291bnRlciI6ICI5ODc2LTU0MzItMTAwMCIKfQ==";
    const result = validateBase64Encoding(payload);
    expect(result).toBe(true);
  });
  it("validateBase64Encoding invalid", async () => {
    const payload = "bad encoding";
    const result = validateBase64Encoding(payload);
    expect(result).toBe(false);
  });
});
