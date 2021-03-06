require("jest");

const {
  GetDocumentByRefreshTokenStrategy,
} = require("../../src/oauthHandlers/tokenHandlerStrategyClasses/documentStrategies/getDocumentByRefreshTokenStrategy");

const {
  buildFakeDynamoClient,
  buildFakeLogger,
  createFakeConfig,
} = require("../testUtils");
const MockExpressRequest = require("mock-express-request");

const HMAC_SECRET = "secret";
const STATE = "abc123";
const CODE_HASH_PAIR = [
  "the_fake_authorization_code",
  "9daf298b2cb68502791f6f264aef8ebb56dc0ddd3542fbd1c4bd675538fd9cb8",
];
const REFRESH_TOKEN_HASH_PAIR = [
  "the_fake_refresh_token",
  "9b4dba523ad0a7e323452871556d691787cd90c6fe959b040c5864979db5e337",
];
const REDIRECT_URI = "http://localhost/thisDoesNotMatter";

let dynamoClient;
let config;
let logger;
let req;

describe("getDocumentByRefreshTokenStrategy tests", () => {
  beforeEach(() => {
    config = createFakeConfig();
    config.hmac_secret = HMAC_SECRET;
    logger = buildFakeLogger();
    req = new MockExpressRequest({
      body: {
        refresh_token: REFRESH_TOKEN_HASH_PAIR[0],
      },
    });
  });

  it("Happy Path - Hashed Token", async () => {
    dynamoClient = buildFakeDynamoClient({
      state: STATE,
      code: CODE_HASH_PAIR[1],
      refresh_token: REFRESH_TOKEN_HASH_PAIR[1],
      redirect_uri: REDIRECT_URI,
    });

    let strategy = new GetDocumentByRefreshTokenStrategy(
      req,
      logger,
      dynamoClient,
      config
    );
    let document = await strategy.getDocument();

    expect(document).toEqual({
      state: STATE,
      code: CODE_HASH_PAIR[1],
      refresh_token: REFRESH_TOKEN_HASH_PAIR[1],
      redirect_uri: REDIRECT_URI,
    });
  });

  it("Could not retrieve Token", async () => {
    dynamoClient = buildFakeDynamoClient();
    let usernamePassword = Buffer.from("user1:pass1").toString("base64");
    req.headers = { authorization: `Basic ${usernamePassword}` };
    let strategy = new GetDocumentByRefreshTokenStrategy(
      req,
      logger,
      dynamoClient,
      config
    );

    let document = await strategy.getDocument();
    expect(document).toEqual(undefined);

    expect(logger.error).toHaveBeenCalledWith(
      "Could not retrieve state from DynamoDB",
      expect.anything()
    );
  });

  it("Could not retrieve Token, ClientID in body", async () => {
    dynamoClient = buildFakeDynamoClient();
    let strategy = new GetDocumentByRefreshTokenStrategy(
      req,
      logger,
      dynamoClient,
      config,
      "user1"
    );

    let document = await strategy.getDocument();
    expect(document).toEqual(undefined);
  });
});
