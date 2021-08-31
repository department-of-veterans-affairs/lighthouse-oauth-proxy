#!/usr/bin/env bats

usage() {
cat <<EOF
Tests the Oauth Proxy's token endpoint.

Example
  HOST="https://sandbox-api.va.gov/oauth2" TOKEN_FILE={ Token File } STATIC_ACCESS_TOKEN=$STATIC_ACCESS_TOKEN bats ./issued_tests.bats
EOF
}

setup() {
  if [ -z "$HOST" ]; then
    echo "ERROR HOST is a required parameter."
    usage
    exit 0
  fi

  if [ -z "$STATIC_ACCESS_TOKEN" ]; then
    echo "ERROR STATIC_ACCESS_TOKEN is a required parameter."
    usage
    exit 0
  fi

  if [ -z "$TOKEN_FILE" ]; then
    echo "ERROR TOKEN_FILE is a required parameter."
    usage
    exit 0
  fi

  curl_status="$(mktemp)"
  curl_body="$(mktemp)"
}

teardown() {
  rm $curl_status
  rm $curl_body
}

do_issued() { 
  local token=$1

  curl -X GET \
    -s \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -H "Authorization: Bearer $token" \
    -w "%{http_code}" \
    -o "$curl_body" \
    "$HOST/issued" > "$curl_status"
}

# static tokens

@test 'Static Token. Valid' {
  do_issued $STATIC_ACCESS_TOKEN
  cat $curl_body
  cat $curl_status
  [ "$(cat "$curl_status")" -eq 200 ]
  [ "$(cat "$curl_body" | jq .static | tr -d '"')" == "true" ]
  [ "$(cat "$curl_body" | jq .scopes | tr -d '"')" == "openid profile patient/Medication.read launch/patient offline_access" ]
  [ "$(cat "$curl_body" | jq .expires_in | tr -d '"')" == 3600 ]
  [ "$(cat "$curl_body" | jq .icn | tr -d '"')" == "555" ]
  [ "$(cat "$curl_body" | jq .aud | tr -d '"')" == "http://localhost:7100/services/static-only" ]
}

@test 'Non-Static. Valid token' {
  do_issued $(cat "$TOKEN_FILE" | jq .access_token | tr -d '"')
  cat "$curl_status"
  [ "$(cat "$curl_status")" -eq 200 ]
  [ "$(cat "$curl_body" | jq 'has("iss")')" == "true" ]
}

@test 'General. Invalid token' {
  do_issued bad
  [ "$(cat "$curl_status")" -eq 401 ]
  [ "$(cat "$curl_body")" == "Unauthorized" ]
}

@test 'General. Missing token' {
  do_issued
  cat "$curl_status"
  [ "$(cat "$curl_status")" -eq 400 ]
}