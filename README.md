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
The [init-git-secrets.sh](common/scripts/init-git-secrets.sh) script can be used to simply set up.
