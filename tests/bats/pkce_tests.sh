#!/usr/bin/env bash
# Team Pivot!
# Simple script to test the Oauth Proxy.

usage() {
cat <<EOF
Runs e2e Oauth Proxy regression tests.

Example
  export USER_EMAIL=va.api.user+idme.001@gmail.com
  export USER_PASSWORD=Password1234!
  export PKCE_CLIENT_ID={{ client id }}
  export PKCE_AUTH_SERVER=https://sandbox-api.va.gov/oauth2
 
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

if [ -z "$PKCE_CLIENT_ID" ];
then
  echo "ERROR - PKCE_CLIENT_ID is a required parameter."
  exit 1
fi

if [ -z "$PKCE_AUTH_SERVER" ];
then
  echo "ERROR - PKCE_AUTH_SERVER is a required parameter."
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

tokan_payload_pkce() {
  local network=""
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
      --redirect-uri="$REDIRECT_URI" \
      --authorization-url="$PKCE_AUTH_SERVER" \
      --user-email="$USER_EMAIL" \
      --user-password="$USER_PASSWORD" \
      --client-id="$PKCE_CLIENT_ID" \
      --grant_consent="true" \
      --scope="openid offline_access" \
      --pkce)

  if [[ -z $payload ]];
  then
    echo -e "\nFailed to retrieve code."
    echo "This is likely a lighthouse-auth-utilities bot issue."
    echo "Check for valid configuration."
    echo "Exiting ... "
    exit 1
  fi
  echo "$payload"
}


# ----

# Pulling latest lighthouse-auth-utils docker image if necessary
# docker pull vasdvp/lighthouse-auth-utils:latest

# Start Tests

# will track test failures
status=0

echo "Fetching token using pkce ..."
payload=$(tokan_payload_pkce)
echo "Running Token Tests ..."
token_file="$(mktemp)"
# echo `echo $payload | jq`
TOKEN_PAYLOAD="$payload" bats ./token_tests_pkce.bats
status=$(($status + $?))
# TOKEN and EXPIRED_ACCESS are assigned in token_tests.sh

if [ "$status" -gt 0 ];
then
  echo "Some tests failed"
  exit 1
fi

echo "All tests passed!"
