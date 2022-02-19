#!/usr/bin/env bats

usage() {
cat <<EOF
Tests the Oauth Proxy's token endpoint using tokens genereated with PKCE clients.

Example
  TOKEN_PAYLOAD="{'access_token':'xxxxx', 'refresh_token':'yyyyy'}"
EOF
}
setup() {
  if [ -z "$TOKEN_PAYLOAD" ]; then
    echo "ERROR TOKEN_PAYLOAD is a required parameter."
    usage
    exit 0
  fi

  if [ -z "$PKCE_CLIENT_ID" ]; then
    echo "ERROR PKCE_CLIENT_ID is a required parameter."
    usage
    exit 0
  fi

  if [ -z "$PKCE_AUTH_SERVER" ]; then
    echo "ERROR PKCE_AUTH_SERVER is a required parameter."
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

@test 'Token Handler PKCE happy path' {
  [  "$(echo "$TOKEN_PAYLOAD" | jq 'has("access_token")')" == "true" ]
  [  "$(echo "$TOKEN_PAYLOAD" | jq 'has("refresh_token")')" == "true" ]
}

@test 'valid PKCE access token' {
  access_token=$(echo "$TOKEN_PAYLOAD" | jq ".access_token" | tr -d '"')
  do_introspect "$access_token" "access_token" "$PKCE_CLIENT_ID"

  [ "$(cat "$curl_body" | jq .active | tr -d '"')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("scope")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("username")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("exp")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("iat")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("sub")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("aud")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("iss")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("jti")')" == "true" ]
  [ "$(cat "$curl_body" | jq .token_type | tr -d '"')" == "Bearer" ]
  [ "$(cat "$curl_body" | jq 'has("uid")')" == "true" ]
}

do_introspect() {
  local token="$1"
  local hint="$2"
  local client_id="$3"

  curl -X POST \
    -s \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -o "$curl_body" \
    -d "token_type_hint=$hint" \
    -d "token=$token" \
    -d "client_id=$client_id" \
    "$PKCE_AUTH_SERVER/introspect" > "$curl_status"
}
