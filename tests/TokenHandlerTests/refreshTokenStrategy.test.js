require("jest");
const MockExpressRequest = require("mock-express-request");
const { TokenSet } = require("openid-client");
const { buildOpenIDClient, buildFakeLogger } = require("../testUtils");
const {
  RefreshTokenStrategy,
} = require("../../src/oauthHandlers/tokenHandlerStrategyClasses/tokenStrategies/refreshTokenStrategy");
let logger;
let client;

beforeEach(() => {
  logger = buildFakeLogger();
  client = buildOpenIDClient({
    refresh: (resolve) => {
      resolve(
        new TokenSet({
          access_token: "real-access-token",
          refresh_token: "real-refresh-token",
          expires_in: 60,
        })
      );
    },
  });
});
const realRefreshTests = async () => {
  it("Happy Path", async () => {
    let req = new MockExpressRequest({
      body: {
        grant_type: "refresh_token",
        refresh_token: "real-refresh-token",
        state: "abc123",
      },
    });

    let refreshTokenStrategy = new RefreshTokenStrategy(req, logger, client);

    let token = await refreshTokenStrategy.getToken();
    expect(token.access_token).toEqual("real-access-token");
    expect(token.refresh_token).toEqual("real-refresh-token");
    expect(token.expires_in).toEqual(60);
  });
  it("client error", async () => {
    client = { refresh: jest.fn() };
    client.refresh.mockImplementation(() => {
      throw {
        response: {
          body: {
            error: "client error",
            error_description: "this is a client error",
          },
        },
      };
    });

    let req = new MockExpressRequest({
      body: {
        grant_type: "refresh_token",
        refresh_token: "real-refresh-token",
        state: "abc123",
      },
    });

    let refreshTokenStrategy = new RefreshTokenStrategy(req, logger, client);

    try {
      await refreshTokenStrategy.getToken();
      fail("Client error should have been thrown.");
    } catch (err) {
      expect(err.error).toBe("client error");
      expect(err.error_description).toBe("this is a client error");
      expect(err.statusCode).toBe(500);
      return;
    }
  });
};
describe("tokenHandler refreshTokenStrategy", () => {
  describe("Real Refresh Static token service off", () => {
    realRefreshTests();
  });
});
