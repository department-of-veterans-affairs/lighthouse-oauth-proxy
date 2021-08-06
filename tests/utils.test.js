"use strict";

require("jest");
const {
  statusCodeFromError,
  parseBasicAuth,
  parseClientId,
  parseBearerAuthorization,
  hashString,
  minimalError,
  handleOpenIdClientError,
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
      badStructure: "this error is not known by the handleOpenIdClientError method",
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
        badStructure: "this error is not known by the handleOpenIdClientError method",
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
