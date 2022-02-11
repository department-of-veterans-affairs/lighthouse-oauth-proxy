# OAuth Proxy

The OAuth proxy sits between client applications (run by API consumers) and our Okta deployment. It implements
the SMART on FHIR spec, which is an OAuth overlay. This involves tracking a state value for the user across
sessions, so that initial auth flows and refresh auth flows send the same state to the client application.

## Running locally

The OAuth proxy also requires configuration to run locally. It is tied tightly with Okta and you'll need 
to have access to an okta authorization server and an api key for the server. 

To being you'll want to create a `dev-config.json` in the oauth-proxy subdirectory. That file should contain a 
JSON object containing fields that corresponesd to the options document by the `--help` option. Once you've
created that config you can run `npm start` to run the OAuth proxy with the code changes.

If you're a VA developer, a dev-config file can be found in the [oauth-proxy-configs](https://github.com/department-of-veterans-affairs/lighthouse-oauth-proxy-configs) repository. Fields with the `FIX_ME` value must be replaced with the real value.

You'll also want to setup a local instance of DynamoDB either by running `docker-compose` to start the proxy or 
by downloading and running it following [Amazon's instructions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html).


## git-secrets

git-secrets must be installed and configured to scan for AWS entries and the patterns in
[.git-secrets-patterns](.git-secrets-patterns). Exclusions are managed in
[.gitallowed](.gitallowed).
The [init-git-secrets.sh](src/scripts/init-git-secrets.sh) script can be used to simply set up.
This is a slim proxy for transforming and storing values from Okta's OpenID Connect service in order to be compatible with the SMART-on-FHIR auth specification.

## Requirements

- Node 12.0.0 or greater

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
node src/dynamo_schema.js --local=true
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

The proxy transforms the upstream OIDC servers' metadata at `/.well-known/openid-configuration` to each OIDC server's  hostnames with the `protocol://host:port` configured with the `--host` option.

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
