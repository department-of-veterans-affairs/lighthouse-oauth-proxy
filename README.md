# OAuth Proxy

This is a slim proxy for transforming and storing values from Okta's OpenID Connect service in order to be compatible with the SMART-on-FHIR auth specification.

## Requirements

- Node 12.21.0 or greater

## Usage

- Run `npm i` to install dependencies.

### Quick Start Docker Compose

`docker-compose up`

### Quick Start Local

A functional dev-config.json file can be pulled from the [oauth-proxy-configs](https://github.com/department-of-veterans-affairs/lighthouse-oauth-proxy-configs) repository. Fields with the `FIX_ME` value must be replaced with a real value.

Set up Dynamo DB locally

The following dev-config value needs to be set `"dynamo_local": "localhost:8000",`

```
docker run -d -p 8000:8000 amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb -inMemory
node dynamo_schema.js --local=true
```

Start the Oauth Proxy
```
npm start
```

Generate jsdocs for Oauth Proxy
```
npm install -g jsdoc
jsdoc .
```
Browsable jsdocs will be located in
```
./out/
```


- See `node index.js --help` for more usage directions

## Proxy Functions

### Metadata

The proxy transforms Okta's metadata at `/.well-known/openid-configuration` to replace Okta's hostnames with the `protocol://host:port` configured with the `--host` option.

### Authorization

The OAuth authorization route is also proxied by issuing a redirect to Okta to the client when they request the `/authorization` endpoint on the proxy. The proxy preforms a lookup against the Okta API to verify that the supplied `redirect_uri` is on the application's whitelist. The proxy then replaces the `redirect_uri` with an redirect url controlled by the proxy.

The proxy also saves the `state` parameter, associated with the original `redirect_uri` to a DynamoDB table.

### Redirect

Okta redirects the client's browser back to our proxy where the original `redirect_uri` is looked up based on the returned `state` parameter from okta and then redirects the client's browser back to the original `redirect_uri` with the authorization code or implicit token.

It also updates the dyanmotable with the authorization `code` if the request is not using the implicit flow.

### Token

The proxy intercepts POST requests to issue tokens. It handles refresh tokens and authorization codes and will reject all other token requests with a HTTP 400 Bad Request error. As part of the lookup we load the `state` from DynamoDB based on either the code or refresh token, and updated the DynamoDB entry with the new refresh token returned by Okta.

If the token request includes the `launch/patient` scope we lookup the Veteran's ICN using vets-api's `/internal/openid-auth/v0/validation` and return that as the `"patient"` field in the token response.

## License

This project is public domain licensed using the [CC0](https://creativecommons.org/share-your-work/public-domain/cc0/) text.
