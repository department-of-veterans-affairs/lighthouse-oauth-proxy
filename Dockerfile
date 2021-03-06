FROM vasdvp/lighthouse-node-application-base:node16

# Build Args
ARG FWDPROXYCRT

USER node
WORKDIR /home/node
RUN cat /opt/octopus/ca-certificates/ca-certs.pem > ./ca-certs.pem

# Wildcard can handle copy of non-existent file
COPY ./fwdproxy*.crt ./

RUN if [ "$FWDPROXYCRT" = "true" ] ; then openssl x509 -in ./fwdproxy.crt >> ./fwdproxy.pem; else echo "fwdproxy.crt does not exist"; fi
RUN if [ "$FWDPROXYCRT" = "true" ] ; then cat ./fwdproxy.pem >> ./ca-certs.pem; else echo "fwdproxy.pem does not exist"; fi

FROM vasdvp/lighthouse-node-application-base:node16 as base

# Build Args
ARG BUILD_DATE_TIME
ARG VERSION
ARG BUILD_NUMBER
ARG BUILD_TOOL

# Static Labels
LABEL org.opencontainers.image.authors="leeroy-jenkles@va.gov" \
      org.opencontainers.image.url="https://github.com/department-of-veterans-affairs/lighthouse-oauth-proxy/tree/master/Dockerfile" \
      org.opencontainers.image.documentation="https://github.com/department-of-veterans-affairs/lighthouse-oauth-proxy/tree/master/README.md" \
      org.opencontainers.image.vendor="lighthouse" \
      org.opencontainers.image.title="oauth-proxy" \
      org.opencontainers.image.source="https://github.com/department-of-veterans-affairs/lighthouse-oauth-proxy/tree/master" \
      org.opencontainers.image.description="OAuth Proxy for Lighthouse APIs"

# Dynamic Labels
LABEL org.opencontainers.image.created=${BUILD_DATE_TIME} \
      org.opencontainers.image.version=${VERSION} \
      gov.va.build.number=${BUILD_NUMBER} \
      gov.va.build.tool=${BUILD_TOOL}


WORKDIR /home/node

RUN git config --global url."https://".insteadOf git://
COPY --chown=node:node ./package.json package.json
COPY --chown=node:node ./package-lock.json package-lock.json
RUN npm install

COPY --chown=node:node ./ ./

EXPOSE 7100 7100

HEALTHCHECK --interval=1m --timeout=4s --start-period=30s \
  CMD curl -f http://localhost:7100/oauth2/.well-known/openid-configuration || exit 1

ENTRYPOINT ["/usr/local/bin/tini", "--"]
CMD ["node", "src/index.js", "--config", "/etc/oauth-proxy/config.json"]

from base as deploy
COPY --from=0 /home/node/ca-certs.pem /opt/octopus/ca-certificates/ca-certs.pem
