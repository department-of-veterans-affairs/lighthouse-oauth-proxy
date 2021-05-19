FROM vasdvp/health-apis-dev-tools:mvn-3.6-jdk-14

COPY /tests/bats /bats
COPY /entrypoint_test.sh /bats/entrypoint_test.sh

RUN npm i -g bats

WORKDIR /bats

ENTRYPOINT [ "./entrypoint_test.sh" ]