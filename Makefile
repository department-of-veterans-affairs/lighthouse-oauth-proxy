## variables:
## 	AWS_REGION = AWS Region: defaults to us-gov-west-1
## 	IMAGE      = Folder for image: defaults to base
## 	TAG        = Tag for image reference: defaults to latest
##	NAMESPACE  = Namespace for the repositories
##	NEW_TAG    = New tag to assign to an image
##
# Gets Account ID
AWS_ACCOUNT_ID:=$(shell aws sts get-caller-identity | jq .Account -r)
# Sets default namespace for repo
NAMESPACE ?= dvp
# Sets default region
AWS_REGION ?= us-gov-west-1
# Sets default tag
TAG ?= dev
# Shorten full repo path
REPOSITORY:=$(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
# Build Args
BUILD_DATE_TIME ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
BUILD_TOOL ?= Makefile
BUILD_VERSION ?= $(shell git rev-parse --short HEAD)
BUILD_NUMBER ?= $(shell echo $$RANDOM)
IMAGE ?= oauth-proxy
TARGET ?= base

.PHONY : help
help : Makefile
	@sed -n 's/^##//p' $<

## login:	Login to ECR
.PHONY: login
login:
	aws ecr get-login-password | docker login --username AWS --password-stdin $(REPOSITORY)

## build:	Build oauth-proxy image
.PHONY: build
build:
	## build:	Build Docker image
	docker build -t $(REPOSITORY)/$(NAMESPACE)/$(IMAGE):$(TAG) \
		-f $(IMAGE)/Dockerfile \
		--target $(TARGET) \
		--build-arg AWS_ACCOUNT_ID=$(AWS_ACCOUNT_ID) \
		--build-arg BUILD_DATE_TIME=$(BUILD_DATE_TIME) \
		--build-arg BUILD_TOOL=$(BUILD_TOOL) \
		--build-arg VERSION=$(BUILD_VERSION) \
		--build-arg BUILD_NUMBER=$(BUILD_NUMBER) \
		--no-cache .

## lint: Linting
.PHONY: lint
lint:
	docker run --rm --entrypoint='' \
		-w "/home/node" \
		$(REPOSITORY)/$(NAMESPACE)/$(IMAGE):$(TAG) \
		npm run-script lint

## test: Unit Tests
.PHONY: test
test:
	docker run --rm --entrypoint='' \
		-w "/home/node" \
		$(REPOSITORY)/$(NAMESPACE)/$(IMAGE):$(TAG) \
		npm run test:ci

## pull: 	Pull an image to ECR
.PHONY: pull
pull:
	docker pull $(REPOSITORY)/$(NAMESPACE)/$(IMAGE):$(TAG)

## push: 	Pushes an image to ECR
.PHONY: push
push:
	docker push $(REPOSITORY)/$(NAMESPACE)/$(IMAGE):$(TAG)

## tag:	Adds a tag to an existing image in ECR
.PHONY: tag
tag:
	@echo Tagging $(NAMESPACE)/$(IMAGE):$(TAG) with $(NEW_TAG)
	@aws ecr put-image --repository-name $(NAMESPACE)/$(IMAGE) --image-tag $(NEW_TAG) --image-manifest "$$(aws ecr batch-get-image --repository-name $(NAMESPACE)/$(IMAGE) --image-ids imageTag=$(TAG) --query 'images[].imageManifest' --output text)" > /dev/null

## labels: Get ECR labels.
.PHONY: get_labels
get_labels:
	@echo Getting labels from ECR  for $(NAMESPACE)/$(IMAGE):$(TAG)
	@aws ecr batch-get-image --repository-name $(NAMESPACE)/$(IMAGE) --image-id imageTag=$(TAG) --accepted-media-types "application/vnd.docker.distribution.manifest.v1+json" --output json |jq -r '.images[].imageManifest' |jq -r '.history[0].v1Compatibility' |jq -r '.config.Labels'

## clean:	Removes a local image
.PHONY: clean
clean:
	docker image rm $(REPOSITORY)/$(NAMESPACE)/$(IMAGE):$(TAG)
