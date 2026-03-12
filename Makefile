.PHONY: build auth deploy

build:
	cd code && npm ci && npm run build

auth:
	devrev profiles authenticate --org $(ORG)

deploy:
	cd code && npm run package
	devrev snap_in_version create-one --manifest ../manifest.yaml --create-package
	devrev snap_in draft
	devrev snap_in activate
