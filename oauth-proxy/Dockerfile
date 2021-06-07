from vasdvp/lighthouse-node-application-base:node12

USER node
WORKDIR /home/ca-certificates
COPY ./fwdproxy.crt ./fwdproxy.crt
RUN openssl x509 -in ./fwdproxy.crt >> ./fwdproxy.pem
RUN cat  /ca-certificates/ca-certs.pem > ./ca-certs.pem
RUN cat  ./fwdproxy.pem >> ./ca-certs.pem

FROM vasdvp/lighthouse-node-application-base:node12 as base

WORKDIR /home/node

RUN git config --global url."https://".insteadOf git://
COPY --chown=node:node ./oauth-proxy/package.json package.json
COPY --chown=node:node ./oauth-proxy/package-lock.json package-lock.json
RUN npm install

COPY --chown=node:node ./oauth-proxy ./

EXPOSE 7100 7100

HEALTHCHECK --interval=1m --timeout=4s --start-period=30s \
  CMD curl -f http://localhost:7100/oauth2/.well-known/openid-configuration || exit 1

ENTRYPOINT ["/usr/local/bin/tini", "--"]
CMD ["node", "index.js"]

from base as deploy
COPY --from=0 /home/ca-certificates/ca-certs.pem /ca-certificates/ca-certs.pem
