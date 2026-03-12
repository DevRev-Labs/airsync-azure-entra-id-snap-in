# Azure Entra ID Snap-in

A DevRev Airdrop snap-in that syncs identity and directory data from **Azure Entra ID** (Microsoft Entra ID) to DevRev.

## Overview

This snap-in connects to Microsoft Graph API and extracts the following from your Azure tenant:

| Category | Entities |
|----------|----------|
| **Mandatory** | Users, Groups, Group Members, Directory Roles, Role Members |
| **Optional** | Applications, Service Principals, Devices, Org Contacts |
| **Custom** | Directory extension attributes on Users (mapped to DevRev custom fields) |

Data flows **one-way** (Azure Entra ID → DevRev) and supports **incremental sync** via Microsoft Graph delta queries.

### Connection

- **Authentication**: OAuth 2.0 Client Credentials
- **Configuration**: Azure Tenant ID (subdomain), Client ID, and Client Secret from an Azure AD app registration

See [TECHNICAL_DESIGN_DOC.md](./TECHNICAL_DESIGN_DOC.md) for detailed design and entity mappings.

---

## Prerequisites

- **Node.js** 18+ and npm
- **DevRev CLI** (`devrev`) installed and available on `PATH`
- **Azure Entra ID** app registration with required Microsoft Graph application permissions:
  - `User.Read.All`
  - `GroupMember.Read.All`
  - `RoleManagement.Read.Directory`
  - `Application.Read.All`
  - `Device.Read.All`
  - `OrgContact.Read.All`

---

## Build

```bash
cd code
npm ci
npm run build
```

Or using the Makefile:

```bash
make build
```

---

## Deployment (DevRev CLI)

### 1. Authenticate with DevRev

```bash
devrev profiles authenticate --org <your-devrev-org-slug>
```

Replace `<your-devrev-org-slug>` with your DevRev organization slug (e.g. `my-company`).

### 2. Build the package

From the project root:

```bash
cd code
npm run package
```

This runs the build and creates `build.tar.gz` with the compiled code and dependencies.

### 3. Create snap-in version and upload

From the project root (one level above `code/`):

```bash
devrev snap_in_version create-one --manifest manifest.yaml --create-package
```

The `--create-package` flag uses the `build.tar.gz` produced in the previous step.

### 4. Draft and activate

```bash
devrev snap_in draft
devrev snap_in activate
```

### One-liner (with Makefile)

If using the provided Makefile:

```bash
make build
make auth ORG=<your-devrev-org-slug>
make deploy
```

---

## Project Structure

```
.
├── manifest.yaml          # Snap-in config, keyring types, imports
├── code/
│   ├── src/
│   │   ├── functions/
│   │   │   ├── extraction/       # Data extraction workers
│   │   │   └── external-system/  # API client, normalization, EDM
│   │   └── main.ts
│   └── package.json
└── TECHNICAL_DESIGN_DOC.md
```

---

## License

Copyright (c) 2024 DevRev Inc. All rights reserved.
