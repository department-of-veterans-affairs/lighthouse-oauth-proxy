const {
  SaveDocumentLaunchStrategy,
} = require("../../src/oauthHandlers/tokenHandlerStrategyClasses/saveDocumentStrategies/saveDocumentLaunchStrategy");
const { buildToken } = require("./tokenHandlerTestUtils");
const {
  buildFakeDynamoClient,
  buildFakeLogger,
  createFakeConfig,
  createFakeHashingFunction,
  convertObjectToDynamoAttributeValues,
} = require("../testUtils");

require("jest");

describe("saveDocumentToDynamo tests", () => {
  let logger;
  let dynamoClient;
  let config;
  let hashingFunction;

  beforeEach(() => {
    logger = buildFakeLogger();
    config = createFakeConfig();
    hashingFunction = createFakeHashingFunction();
    jest.useFakeTimers("modern");
    jest.setSystemTime(new Date("1995-06-23T00:00:00.000+08:00"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("Empty Tokens", async () => {
    let token = buildToken(false, false);
    let document = convertObjectToDynamoAttributeValues({
      access_token: token,
      launch: "launch",
    });
    dynamoClient = buildFakeDynamoClient(document);

    const strategy = new SaveDocumentLaunchStrategy(
      logger,
      dynamoClient,
      config,
      hashingFunction
    );
    await strategy.saveDocumentToDynamo(document, null);

    expect(logger.error.mock.calls).toHaveLength(1);
  });

  it("Missing Document Launch", async () => {
    let token = buildToken(false, false);

    let document = convertObjectToDynamoAttributeValues({
      access_token: token,
    });
    dynamoClient = buildFakeDynamoClient(document);
    const strategy = new SaveDocumentLaunchStrategy(
      logger,
      dynamoClient,
      config,
      hashingFunction
    );

    await strategy.saveDocumentToDynamo(document, token);
    expect(dynamoClient.savePayloadToDynamo).not.toHaveBeenCalled();
    expect(logger.error.mock.calls).toHaveLength(0);
  });

  it("Empty Document Launch", async () => {
    let token = buildToken(false, false);

    let document = convertObjectToDynamoAttributeValues({
      access_token: token,
    });
    document.launch = "";
    dynamoClient = buildFakeDynamoClient(document);
    const strategy = new SaveDocumentLaunchStrategy(
      logger,
      dynamoClient,
      config,
      hashingFunction
    );

    await strategy.saveDocumentToDynamo(document, token);
    expect(dynamoClient.savePayloadToDynamo).not.toHaveBeenCalled();
    expect(logger.error.mock.calls).toHaveLength(0);
  });

  it("happy path", async () => {
    let token = buildToken(false, false);
    token.launch = "launch";

    let document = convertObjectToDynamoAttributeValues({
      access_token: token,
      launch: "launch",
    });
    dynamoClient = buildFakeDynamoClient(document);

    const strategy = new SaveDocumentLaunchStrategy(
      logger,
      dynamoClient,
      config,
      hashingFunction
    );

    await strategy.saveDocumentToDynamo(document, token);
    expect(dynamoClient.savePayloadToDynamo).toHaveBeenCalledWith(
      {
        access_token:
          "e0f866111645e58199f0382a6fa50a217b0c2ccc1ca07e27738e758e1183a8db",
        expires_on: 803837100,
        launch: {
          S: "launch",
        },
      },
      "LaunchContext"
    );
    expect(logger.error.mock.calls).toHaveLength(0);
  });
});
