const {
  GetDocumentByLaunchStrategy,
} = require("../../src/oauthHandlers/tokenHandlerStrategyClasses/documentStrategies/getDocumentByLaunchStrategy");
const MockExpressRequest = require("mock-express-request");

require("jest");

describe("getDocumentByLaunchStrategy tests", () => {
  it("undefined launch", async () => {
    const req = new MockExpressRequest({
      body: {
        launch: undefined,
      },
    });

    const strategy = new GetDocumentByLaunchStrategy(req);
    const document = await strategy.getDocument();
    expect(document.launch).toBe(undefined);
  });

  it("empty launch", async () => {
    const req = new MockExpressRequest({
      body: {
        launch: "",
      },
    });

    const strategy = new GetDocumentByLaunchStrategy(req);

    const document = await strategy.getDocument();
    expect(document.launch).toBe("");
  });

  it("empty request body", async () => {
    const req = new MockExpressRequest({
      body: {},
    });

    const strategy = new GetDocumentByLaunchStrategy(req);

    const document = await strategy.getDocument();
    expect(document.launch).toBe(undefined);
  });
  it("non-empty launch", async () => {
    const req = new MockExpressRequest({
      body: {
        launch: "42",
      },
    });

    const strategy = new GetDocumentByLaunchStrategy(req);

    const document = await strategy.getDocument();
    expect(document.launch).toBe("42");
  });
});
