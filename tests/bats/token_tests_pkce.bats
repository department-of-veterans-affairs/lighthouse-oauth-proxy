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
  token_file="$(mktemp)"
}

teardown() {
  rm $curl_status
  rm $curl_body
  rm $token_file
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


@test 'Token Handler PKCE refresh happy path' {
  refresh=$(echo "$TOKEN_PAYLOAD" | jq ".refresh_token" | tr -d '"')

  do_token "$(jq \
                -scn \
                --arg client_id "$PKCE_CLIENT_ID" \
                --arg grant_type "refresh_token" \
                --arg refresh_token "$refresh" \
                '{"client_id": $client_id, "grant_type": $grant_type, "refresh_token": $refresh_token}')"

  [ "$(cat "$curl_body" | jq 'has("access_token")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("id_token")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("refresh_token")')" == "true" ]
  [ "$(cat "$curl_body" | jq .token_type | tr -d '"')" == "Bearer" ]
  [ "$(cat "$curl_body" | jq 'has("scope")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("expires_in")')" == "true" ]
  [ "$(cat "$curl_body" | jq 'has("state")')" == "true" ]
}

@test 'Revoke active token happy path' {
  access_token=$(echo "$TOKEN_PAYLOAD" | jq ".access_token" | tr -d '"')
  do_introspect "$access_token" "access_token" "$PKCE_CLIENT_ID"
  [ "$(cat "$curl_body" | jq .active | tr -d '"')" == "true" ]
  do_revoke_token "$access_token" "access_token" "$PKCE_CLIENT_ID"
  [ "$(cat "$curl_status")" -eq 200 ]
  do_introspect "$access_token" "access_token" "$PKCE_CLIENT_ID"
  [ "$(cat "$curl_body" | jq .active | tr -d '"')" == "false" ]
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


do_token() {
  payload="$1"
  curl -X POST \
    -s \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    -w "%{http_code}" \
    -o "$curl_body" \
    -d "$payload" \
    "$PKCE_AUTH_SERVER/token?redirect_uri=$REDIRECT_URI" > "$curl_status"
  if [[ "$(cat "$curl_status")" == "200" ]] && [ "$(cat "$curl_body" | jq ".error")" = "null" ];
  then
    echo "$(cat "$curl_body")" > "$token_file"
  fi
}

do_revoke_token() { 
  local token=$1
  local grant_type=$2
  local client_id=$3
  curl -X POST \
    -s \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -w "%{http_code}" \
    -o "$curl_body" \
    -d "grant_type=$grant_type" \
    -d "token=$token" \
    -d "client_id=$client_id" \
    "$PKCE_AUTH_SERVER/revoke" > "$curl_status"
}
