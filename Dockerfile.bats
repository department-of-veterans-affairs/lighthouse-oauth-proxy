FROM vasdvp/health-apis-centos:8

# Build Args
ARG BUILD_DATE_TIME
ARG BUILD_VERSION
ARG BUILD_NUMBER
ARG BUILD_TOOL

# Static Labels
LABEL org.opencontainers.image.authors="leeroy-jenkles@va.gov" \
      org.opencontainers.image.url="https://github.com/department-of-veterans-affairs/lighthouse-oauth-proxy/tree/master/Dockerfile.bats" \
      org.opencontainers.image.documentation="https://github.com/department-of-veterans-affairs/lighthouse-oauth-proxy/tree/master/README.md" \
      org.opencontainers.image.vendor="lighthouse" \
      org.opencontainers.image.title="oauth-proxy-tests" \
      org.opencontainers.image.source="https://github.com/department-of-veterans-affairs/lighthouse-oauth-proxy/tree/master" \
      org.opencontainers.image.description="OAuth Proxy Tests for Lighthouse APIs"

# Dynamic Labels
LABEL org.opencontainers.image.created=${BUILD_DATE_TIME} \
      org.opencontainers.image.version=${BUILD_VERSION} \
      gov.va.build.number=${BUILD_NUMBER} \
      gov.va.build.tool=${BUILD_TOOL}

WORKDIR /bats

COPY ./tests/bats ./
COPY ./entrypoint_test.sh ./entrypoint_test.sh

RUN dnf update -y && \
    dnf install git -y

RUN dnf install -y -q https://download.docker.com/linux/centos/8/x86_64/stable/Packages/containerd.io-1.4.4-3.1.el8.x86_64.rpm && \
    curl -fskLS https://get.docker.com | sh

RUN git clone https://github.com/bats-core/bats-core

WORKDIR bats-core

RUN ./install.sh /usr/local

WORKDIR /bats

ENTRYPOINT [ "./entrypoint_test.sh" ]
