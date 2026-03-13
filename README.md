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

## Incremental Sync

This connector supports **time-scoped incremental syncs** using Microsoft Graph delta queries.

### Configure Scheduled Sync

After deploying the snap-in, configure automatic sync schedules in the DevRev UI:

1. Go to: **Settings > Snap-ins > Azure Entra ID**
2. Click **Schedule** or **Sync Settings**
3. Set your desired sync frequency (e.g., hourly, every 6 hours, daily)
4. Enable the schedule
5. Save

### How It Works

- **Initial sync**: Fetches all users, groups, roles, and other entities
- **Incremental sync**: Uses Microsoft Graph delta queries to fetch only changes since the last successful sync
- **Delta tokens**: Automatically managed and stored (valid for 7 days)
- **Token expiry**: If a delta token expires, the connector automatically falls back to a full re-sync for that entity

### What Gets Synced Incrementally

| Entity | Delta Support |
|--------|---------------|
| Users | ✅ Yes - `/users/delta` |
| Groups | ✅ Yes - `/groups/delta` |
| Directory Roles | ✅ Yes - `/directoryRoles/delta` |
| Applications | ✅ Yes - `/applications/delta` |
| Service Principals | ✅ Yes - `/servicePrincipals/delta` |
| Devices | ✅ Yes - `/devices/delta` |
| Org Contacts | ✅ Yes - `/contacts/delta` |
| Group Members | Re-fetched for changed groups |
| Role Members | Re-fetched for changed roles |
| Audit Logs | Time-windowed (last 7 days) |
| Sign-in Logs | Time-windowed (last 7 days) |

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
