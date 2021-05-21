FROM vasdvp/health-apis-centos:8

COPY /tests/bats /bats
COPY /entrypoint_test.sh /bats/entrypoint_test.sh

RUN dnf update -y && \
    dnf install git -y

RUN dnf install -y -q https://download.docker.com/linux/centos/7/x86_64/stable/Packages/containerd.io-1.2.6-3.3.el7.x86_64.rpm && \
    curl -fskLS https://get.docker.com | sh

RUN git clone https://github.com/bats-core/bats-core 

WORKDIR bats-core

RUN ./install.sh /usr/local 


WORKDIR /bats

ENTRYPOINT [ "./entrypoint_test.sh" ]