#!/usr/bin/env bash
# Team Pivot!

usage() {
cat <<EOF
Runs oauth proxy's regression tests.

docker run \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --rm vasdvp/lighthouse-oauth-proxy-tests \
  --user-email="\$USER_EMAIL" \
  --user-password="\$USER_PASSWORD" \
  --client-id="\$CLIENT_ID" \
  --client-secret="\$CLIENT_SECRET" \
  --cc-client-id="\$CC_CLIENT_ID" \
  --cc-client-secret="\$CC_CLIENT_SECRET" \
  --pkce-auth-server=$PKCE_AUTH_SERVER \
  --pkce-client-id=$PKCE_CLIENT_ID \
  --host="\$HOST" \
  --test-claims

Note: If you are running against the a local oauth-proxy instance.
You will need to specify the following network: 
--network container:oauth-proxy_oauth-proxy_1
EOF
}

if [ $# -eq 0 ]; then
  usage
  exit 1
fi

USER_EMAIL=
USER_PASSWORD=
CLIENT_ID=
CLIENT_SECRET=
CC_CLIENT_ID=
CC_CLIENT_SECRET=
HOST=
TEST_CLAIMS=

for i in "$@"
do
case $i in
    --help|-h)
      usage; exit 1 ;;
    --test-claims)
      TEST_CLAIMS="--test-claims"; shift ;;
    --user-email=*)
      export USER_EMAIL="${i#*=}"; shift ;;
    --user-password=*)
      export USER_PASSWORD="${i#*=}"; shift ;;
    --client-id=*)
      export CLIENT_ID="${i#*=}"; shift ;;
    --client-secret*)
      export CLIENT_SECRET="${i#*=}"; shift ;;
    --cc-client-id*)
      export CC_CLIENT_ID="${i#*=}"; shift ;;
    --cc-client-secret*)
      export CC_CLIENT_SECRET="${i#*=}"; shift ;;
    --pkce-client-id-to-screen*)
      export PKCE_CLIENT_ID_TO_SCREEN="${i#*=}"; shift ;;
    --pkce-client-id*)
      export PKCE_CLIENT_ID="${i#*=}"; shift ;;
    --pkce-auth-server*)
      export PKCE_AUTH_SERVER="${i#*=}"; shift ;;
    --host*)
      export HOST="${i#*=}"; shift ;;
esac
done

./regression_tests.sh $TEST_CLAIMS
