#!/usr/bin/env bash
# Team Pivot!
# Simple script to test the Oauth Proxy.

usage() {
cat <<EOF
Runs e2e Oauth Proxy regression tests.

Example
  export USER_EMAIL=va.api.user+idme.001@gmail.com
  export USER_PASSWORD=Password1234!
  export CLIENT_ID={{ client id }}
  export CLIENT_SECRET={{ client secret }}
  export HOST=https://sandbox-api.va.gov/oauth2
  export CC_CLIENT_ID={{ client id }}
  export CC_CLIENT_SECRET={{ client secret }}

  ./regression_tests.sh [--test-issued]
EOF
exit 1
}

for i in "$@"
do
case $i in
    --test-issued)
      TEST_ISSUED="true"; shift ;;
    --help|-h)
      usage ;  exit 1 ;;
    --) shift ; break ;;
    *) usage ; exit 1 ;;
esac
done

# Dependency Check

if ! docker -v COMMAND &> /dev/null
then
    echo "please install docker."
    exit 1
fi

if ! jq --version COMMAND &> /dev/null
then
    echo "Please install jq."
    exit 1
fi

if [ -z "$USER_EMAIL" ];
then
  echo "ERROR - USER_EMAIL is a required parameter."
  exit 1
fi

if [ -z "$USER_PASSWORD" ];
then
  echo "ERROR - USER_PASSWORD is a required parameter."
  exit 1
fi

if [ -z "$CLIENT_ID" ];
then
  echo "ERROR - CLIENT_ID is a required parameter."
  exit 1
fi

if [ -z "$CLIENT_SECRET" ];
then
  echo "ERROR - CLIENT_SECRET is a required parameter."
  exit 1
fi

if [ -z "$HOST" ];
then
  echo "ERROR - HOST is a required parameter."
  exit 1
fi

if [ -z "$CC_CLIENT_ID" ];
then
  echo "ERROR - CC_CLIENT_ID is a required parameter."
  exit 1
fi

if [ -z "$CC_CLIENT_SECRET" ];
then
  echo "ERROR - CC_CLIENT_SECRET is a required parameter."
  exit 1
fi

if [ -z "$PKCE_AUTH_SERVER" ];
then
  echo "ERROR - PKCE_AUTH_SERVER is a required parameter."
  exit 1
fi

if [ -z "$PKCE_CLIENT_ID" ];
then
  echo "ERROR - PKCE_CLIENT_ID is a required parameter."
  exit 1
fi

if [ "$TEST_ISSUED" == "true" ] && [ -z "$STATIC_ACCESS_TOKEN" ];
then
  echo "ERROR - STATIC_ACCESS_TOKEN is a required parameter."
  exit 1
fi

# Variables

export REDIRECT_URI="https://app/after-auth"
pass=1

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Helper Functions

track_result() {
  if [[ "$?" -gt 0 ]]
  then
    pass=0
  fi
}

# --------

# Code and Token Utilities

assign_code() {
  local network=""
  if [[ $HOST == *"localhost"* ]];
  then
    network="-i --network container:lighthouse-oauth-proxy_oauth-proxy_1"
  else
    network=""
  fi

  local code
  code=$(docker run \
      $network --rm \
      vasdvp/lighthouse-auth-utils:latest auth \
      --redirect-uri="$REDIRECT_URI" \
      --authorization-url="$HOST" \
      --user-email="$USER_EMAIL" \
      --user-password="$USER_PASSWORD" \
      --client-id="$CLIENT_ID" \
      --client-secret="$CLIENT_SECRET" \
      --grant_consent="true" \
      --scope="openid profile offline_access email address phone launch/patient" \
      --code-only)

  local CODE
  CODE=$(echo "$code" | jq -r .code)
  if [[ -z $CODE ]];
  then
    echo -e "\nFailed to retrieve code."
    echo "This is likely a lighthouse-auth-utilities bot issue."
    echo "Check for valid configuration."
    echo "Exiting ... "
    exit 1
  fi
  echo "$CODE"
}

tokan_payload_pkce() {
  local network=""

  # This allows for testing with both a v1 and v2 client_id entry
  # for a PKCE-enabled client
  local pkce_client_id=$1

  if [[ $PKCE_AUTH_SERVER == *"localhost"* ]];
  then
    network="-i --network container:lighthouse-oauth-proxy_oauth-proxy_1"
  else
    network=""
  fi

  local payload
  payload=$(docker run \
      $network --rm \
      vasdvp/lighthouse-auth-utils:latest auth \
      --authorization-url="$PKCE_AUTH_SERVER" \
      --user-email="$USER_EMAIL" \
      --user-password="$USER_PASSWORD" \
      --client-id="$pkce_client_id" \
      --grant_consent="true" \
      --scope="openid offline_access" \
      --pkce)

  if [[ -z $payload ]];
  then
    echo -e "\nFailed to retrieve tokens."
    echo "This is likely a lighthouse-auth-utilities bot issue."
    echo "Check for valid configuration."
    echo "Exiting ... "
    exit 1
  fi
  echo "$payload"
}

# ----

# Pulling latest lighthouse-auth-utils docker image if necessary
if [ -z "$USE_LOCAL_IMAGE" ]; then
  docker pull vasdvp/lighthouse-auth-utils:latest
fi

# Start Tests

# will track test failures
status=0

echo "Running Grants Tests ..."
HOST="$HOST" USER_EMAIL="$USER_EMAIL" "$DIR"/okta_grants_tests.bats
status=$(($status + $?))

echo "Fetching code ..."
CODE=$(assign_code)

echo "Running Token Tests ..."
token_file="$(mktemp)"
expired_token_file="$(mktemp)"
HOST="$HOST" CODE="$CODE" TOKEN_FILE="$token_file" EXPIRED_TOKEN_FILE="$expired_token_file" CLIENT_ID="$CLIENT_ID" CLIENT_SECRET="$CLIENT_SECRET" CC_CLIENT_ID="$CC_CLIENT_ID" CC_CLIENT_SECRET="$CC_CLIENT_SECRET" STATIC_REFRESH_TOKEN="$STATIC_REFRESH_TOKEN" bats ./token_tests.bats
status=$(($status + $?))

echo "Running Token PKCE Client Tests ..."
pkce_token_payload=$(tokan_payload_pkce $PKCE_CLIENT_ID)
TOKEN_PAYLOAD="$pkce_token_payload" bats ./token_tests_pkce.bats
status=$(($status + $?))
# TOKEN and EXPIRED_ACCESS are assigned in token_tests.sh

echo "Running Introspect Tests"
HOST="$HOST" TOKEN_FILE="$token_file" EXPIRED_TOKEN_FILE="$expired_token_file" CLIENT_ID="$CLIENT_ID" CLIENT_SECRET="$CLIENT_SECRET" bats "$DIR"/introspect_test.bats
status=$(($status + $?))

echo "Running Misc Tests ..."
HOST="$HOST" CODE="$CODE" TOKEN_FILE="$token_file" CLIENT_ID="$CLIENT_ID" REDIRECT_URI="$REDIRECT_URI" bats "$DIR"/other_test.bats
status=$(($status + $?))

if [ ! -z "$TEST_ISSUED" ]; then
  echo "Running Issued Tests ..."
  HOST="$HOST" TOKEN_FILE="$token_file" STATIC_ACCESS_TOKEN="$STATIC_ACCESS_TOKEN" bats "$DIR"/issued_tests.bats
  status=$(($status + $?))
fi

if [ ! -z "$PKCE_CLIENT_ID_V2" ]; then
  echo "Running PKCE Client V2 transition Tests ..."
  pkce_token_payload=$(tokan_payload_pkce $PKCE_CLIENT_ID_V2)
  TOKEN_PAYLOAD="$pkce_token_payload" PKCE_CLIENT_ID="$PKCE_CLIENT_ID_V2" bats ./token_tests_pkce.bats
  status=$(($status + $?))
fi

if [ "$status" -gt 0 ];
then
  echo "Some tests failed"
  exit 1
fi

echo "All tests passed!"
