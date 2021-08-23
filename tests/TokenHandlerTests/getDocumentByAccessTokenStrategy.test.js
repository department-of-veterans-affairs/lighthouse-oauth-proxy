require("jest");

const {
  GetDocumentByAccessTokenStrategy,
} = require("../../src/oauthHandlers/tokenHandlerStrategyClasses/documentStrategies/getDocumentByAccessTokenStrategy");
const {
  buildFakeDynamoClient,
  buildFakeLogger,
  createFakeConfig,
} = require("../testUtils");

describe("getDocument Tests", () => {
  let logger = buildFakeLogger();
  let dynamoClient;
  let config = createFakeConfig();

  it("Happy Path", async () => {
    dynamoClient = buildFakeDynamoClient({
      access_token: "access_token",
      launch: "launch",
    });

    let document = await new GetDocumentByAccessTokenStrategy(
      logger,
      dynamoClient,
      config
    ).getDocument("access_token", "launch_table");

    expect(document.access_token).toBe("access_token");
    expect(document.launch).toBe("launch");
  });

  it("Dynamo Client Throws Error Fetching Document By Access Token.", async () => {
    dynamoClient = buildFakeDynamoClient({
      access_token: "access_token",
      launch: "launch",
    });

    let document = await new GetDocumentByAccessTokenStrategy(
      logger,
      dynamoClient,
      config
    ).getDocument("not_access_token", "launch_table");

    expect(document).toBe(undefined);
  });
});
