const { config, DynamoDB } = require("aws-sdk");
const yargs = require("yargs");

const migrationConfig = yargs
  .usage("DynamoDB schema migration to set up the OAuth Proxy")
  .options({
    local: {
      boolean: true,
      default: false,
      description: "Flag to use localhost instead of Docker container hostname",
      required: false,
    },
  })
  .wrap(yargs.terminalWidth()).argv;

// The credentials set here must match those found in docker-compose.yml, oauth-proxy
config.update({
  accessKeyId: "NONE",
  region: "us-west-2",
  secretAccessKey: "NONE",
});

const endpoint = migrationConfig.local
  ? "http://localhost:8000"
  : "http://dynamodb:8000";
console.log(
  `Running migration to create DynamoDB schema for OAuth proxy against the DynamoDB instance at ${endpoint}...`
);
const dynamo = new DynamoDB({ endpoint });

let tableParams = {
  AttributeDefinitions: [
    { AttributeName: "internal_state", AttributeType: "S" },
    { AttributeName: "state", AttributeType: "S" },
    { AttributeName: "code", AttributeType: "S" },
    { AttributeName: "refresh_token", AttributeType: "S" },
    { AttributeName: "access_token", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "internal_state", KeyType: "HASH" }],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
  GlobalSecondaryIndexes: [
    {
      IndexName: "oauth_code_index",
      KeySchema: [
        {
          AttributeName: "code",
          KeyType: "HASH",
        },
      ],
      Projection: {
        ProjectionType: "ALL",
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10,
      },
    },
    {
      IndexName: "oauth_state_index",
      KeySchema: [
        {
          AttributeName: "state",
          KeyType: "HASH",
        },
      ],
      Projection: {
        ProjectionType: "ALL",
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10,
      },
    },
    {
      IndexName: "oauth_refresh_token_index",
      KeySchema: [
        {
          AttributeName: "refresh_token",
          KeyType: "HASH",
        },
      ],
      Projection: {
        ProjectionType: "ALL",
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10,
      },
    },
    {
      IndexName: "oauth_access_token_index",
      KeySchema: [
        {
          AttributeName: "access_token",
          KeyType: "HASH",
        },
      ],
      Projection: {
        ProjectionType: "ALL",
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10,
      },
    },
  ],
  TableName: "OAuthRequestsV2",
};

dynamo.createTable(tableParams, (err, data) => {
  if (err) {
    console.error(
      "Unable to create table. Error JSON:",
      JSON.stringify(err, null, 2)
    );
  } else {
    console.log(
      "Created table. Table description JSON:",
      JSON.stringify(data, null, 2)
    );
  }
});

tableParams = {
  AttributeDefinitions: [
    { AttributeName: "access_token", AttributeType: "S" },
    { AttributeName: "launch", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "access_token", KeyType: "HASH" }],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
  GlobalSecondaryIndexes: [
    {
      IndexName: "oauth_launch_index",
      KeySchema: [
        {
          AttributeName: "launch",
          KeyType: "HASH",
        },
      ],
      Projection: {
        ProjectionType: "ALL",
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10,
      },
    },
  ],
  TableName: "LaunchContext",
};

dynamo.createTable(tableParams, (err, data) => {
  if (err) {
    console.error(
      "Unable to create table. Error JSON:",
      JSON.stringify(err, null, 2)
    );
  } else {
    console.log(
      "Created table. Table description JSON:",
      JSON.stringify(data, null, 2)
    );
  }
});

tableParams = {
  AttributeDefinitions: [{ AttributeName: "client_id", AttributeType: "S" }],
  KeySchema: [{ AttributeName: "client_id", KeyType: "HASH" }],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
  TableName: "Clients",
};

dynamo.createTable(tableParams, (err, data) => {
  if (err) {
    console.error(
      "Unable to create table. Error JSON:",
      JSON.stringify(err, null, 2)
    );
  } else {
    console.log(
      "Created table. Table description JSON:",
      JSON.stringify(data, null, 2)
    );
    createTestClientEntry();
  }
});

tableParams = {
  AttributeDefinitions: [
    { AttributeName: "access_token", AttributeType: "S" },
    { AttributeName: "refresh_token", AttributeType: "S" },
  ],
  KeySchema: [{ AttributeName: "access_token", KeyType: "HASH" }],
  ProvisionedThroughput: {
    ReadCapacityUnits: 10,
    WriteCapacityUnits: 10,
  },
  GlobalSecondaryIndexes: [
    {
      IndexName: "access_token_index",
      KeySchema: [
        {
          AttributeName: "access_token",
          KeyType: "HASH",
        },
      ],
      Projection: {
        ProjectionType: "ALL",
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10,
      },
    },
    {
      IndexName: "refresh_token_index",
      KeySchema: [
        {
          AttributeName: "refresh_token",
          KeyType: "HASH",
        },
      ],
      Projection: {
        ProjectionType: "ALL",
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10,
      },
    },
  ],
  TableName: "StaticTokens",
};

dynamo.createTable(tableParams, (err, data) => {
  if (err) {
    console.error(
      "Unable to create table. Error JSON:",
      JSON.stringify(err, null, 2)
    );
  } else {
    console.log(
      "Created table. Table description JSON:",
      JSON.stringify(data, null, 2)
    );
    createStaticTokenEntry();
  }
});

function createStaticTokenEntry() {
  let itemParams = {
    TableName: "StaticTokens",
    Item: {
      access_token: { S: "123456789" },
      refresh_token: {
        S: "6a9cf6b1af1d8205b771d7c7b7e1770e630f763a755b2f86833ee8ce544df25e",
      },
      scopes: {
        S:
          "openid profile patient/Medication.read launch/patient offline_access",
      },
      expires_in: { N: "3600" },
      icn: { S: "555" },
      aud: { S: "http://localhost:7100/services/static-only" },
      checksum: {
        S: "ada386dcfd6cbd96c0e345d0599503f488f6a7e103b1096e0bd363180204bce5",
      },
    },
  };

  dynamo.putItem(itemParams, (err, data) => {
    if (err) {
      console.error(
        "Unable to create static token entry. Error JSON:",
        JSON.stringify(err, null, 2)
      );
    } else {
      console.log("Created static token entry.");
      console.log(data);
    }
  });
}

function createTestClientEntry() {
  let itemParams = {
    TableName: "Clients",
    Item: {
      client_id: { S: "testclient1" },
      redirect_uris: {
        SS: ["http://localhost:8080/auth/cb", "http://localhost:18080/auth/cb"],
      },
      system: { S: "oauthi" },
    },
  };
  dynamo.putItem(itemParams, (err, data) => {
    if (err) {
      console.error(
        "Unable to create test client. Error JSON:",
        JSON.stringify(err, null, 2)
      );
    } else {
      console.log("Created test client.");
      console.log(data);
    }
  });
}
