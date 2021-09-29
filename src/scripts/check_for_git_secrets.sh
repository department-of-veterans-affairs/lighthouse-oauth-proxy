#!/bin/sh

if grep -sq 'docker\|lxc' /proc/1/cgroup; then
   exit 0
fi

if [ ! -z $CODEBUILD_BUILD_ID]; then
  exit 0
fi
git secrets 2>&1 | grep "is not a git command" > /dev/null
[ $? == 0 ] && echo -e "git secrets is not installed\nSee https://github.com/awslabs/git-secrets" && exit 1

REPO=$(cd $(dirname $0)/../.. && pwd)

if ! git config --get-all secrets.providers | grep -Fq "git secrets --aws-provider"; then
  echo "Registering AWS git-secrets-patterns"
  git secrets --register-aws
fi

if ! git config --get-all secrets.providers | grep -Fq "cat $REPO/.git-secrets-patterns"; then
  echo "Registering local git-secrets-patterns"
  git secrets --add-provider -- cat $REPO/.git-secrets-patterns
fi