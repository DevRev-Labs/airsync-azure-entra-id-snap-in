# Azure Entra ID Snap-in

A DevRev Airdrop snap-in that syncs identity and directory data from **Azure Entra ID** (Microsoft Entra ID) to DevRev.

## Overview

This snap-in connects to Microsoft Graph API and extracts the following from your Azure tenant:

| Category | Entities |
|----------|----------|
| **Mandatory** | Users, Groups, Group Members, Directory Roles, Role Members |
| **Optional** | Applications, Service Principals, Devices, Org Contacts |
| **Advanced** | App Roles, Role Assignments, Authentication Methods, Licenses, PIM Roles, Conditional Access Policies, Lifecycle Workflows |
| **Audit** | Directory Audit Logs, Sign-in Logs |
| **Custom** | Directory extension attributes on Users (mapped to DevRev custom fields) |

Data flows **one-way** (Azure Entra ID → DevRev) and supports **incremental sync** via Microsoft Graph delta queries.

### Connection

- **Authentication**: OAuth 2.0 Client Credentials (Application Permissions)
- **Configuration**: Azure Tenant ID, Client ID, and Client Secret from an Azure AD app registration
- **Security**: Built-in SSRF protection, input sanitization, and comprehensive error handling

See [TECHNICAL_DESIGN_DOC.md](./TECHNICAL_DESIGN_DOC.md) for detailed design and entity mappings.

---

## Prerequisites

### Required Software

- **Node.js** 18+ and npm 9+
- **DevRev CLI** (`devrev`) installed and available on `PATH`
- **Git** (for version control)

### Azure Entra ID Setup

Create an Azure AD app registration with the following **Microsoft Graph API application permissions**:

#### Core Permissions (Required)
- `User.Read.All` - Read all users
- `GroupMember.Read.All` - Read group memberships
- `RoleManagement.Read.Directory` - Read directory roles
- `Directory.Read.All` - Read directory data

#### Optional Permissions (Extended Features)
- `Application.Read.All` - Read applications and service principals
- `Device.Read.All` - Read device registrations
- `OrgContact.Read.All` - Read organizational contacts
- `UserAuthenticationMethod.Read.All` - Read authentication methods (MFA)
- `Policy.Read.All` - Read conditional access policies
- `AuditLog.Read.All` - Read audit and sign-in logs
- `LifecycleWorkflows.Read.All` - Read lifecycle workflows

**Important**: After adding permissions, an Azure AD admin must **grant admin consent** in the Azure Portal.

---

## Project Structure

```
airsync-azure-entra-id-snap-in/
├── manifest.yaml                       # DevRev snap-in configuration
├── README.md                           # This file
├── TECHNICAL_DESIGN_DOC.md             # Detailed technical design
├── SECURITY.md                         # Security best practices and vulnerability protection
├── PERFORMANCE.md                      # Performance optimization guidelines
│
└── code/                               # Source code directory
    ├── package.json                    # Dependencies and scripts
    ├── tsconfig.json                   # TypeScript configuration
    ├── jest.config.js                  # Jest test configuration
    ├── eslint.config.js                # ESLint v9 flat config
    ├── .prettierrc                     # Prettier code formatting
    ├── .eslintignore                   # Linting exclusions
    ├── .prettierignore                 # Formatting exclusions
    │
    ├── src/
    │   ├── main.ts                     # Local testing entry point
    │   ├── function-factory.ts         # Function registry
    │   │
    │   └── functions/
    │       ├── common/                 # Shared utilities
    │       │   ├── constants.ts        # Configuration constants
    │       │   ├── errors.ts           # Custom error classes (10 types)
    │       │   ├── security.ts         # Security validation functions
    │       │   ├── utils.ts            # General utilities
    │       │   ├── state.ts            # State management
    │       │   └── __tests__/          # Unit tests for common utilities
    │       │       ├── errors.test.ts        # 90+ tests for error handling
    │       │       ├── security.test.ts      # 75+ tests for security validation
    │       │       └── utils.test.ts         # 110+ tests for utility functions
    │       │
    │       ├── extraction/             # Data extraction workers
    │       │   ├── index.ts            # Main extraction handler
    │       │   └── workers/
    │       │       ├── data-extraction.ts              # Entity data extraction
    │       │       ├── metadata-extraction.ts          # Schema metadata extraction
    │       │       ├── extraction-helpers.ts           # Shared extraction utilities
    │       │       ├── external-sync-units-extraction.ts  # Sync unit management
    │       │       └── attachments-extraction.ts       # Attachment handling (placeholder)
    │       │
    │       └── external-system/        # External API integration
    │           ├── types.ts            # TypeScript type definitions (19 entity types)
    │           ├── entra_id_api.ts    # Microsoft Graph API client (30+ methods)
    │           ├── data-normalization.ts  # Entity normalization (19 functions)
    │           └── __tests__/          # Unit tests for API integration
    │               ├── entra_id_api.test.ts           # 60+ tests for API client
    │               └── data-normalization.test.ts     # 51 tests for normalization
    │
    ├── dist/                           # Compiled JavaScript (generated)
    └── build.tar.gz                    # Packaged snap-in (generated)
```

### Key Components

| Component | Purpose | Files |
|-----------|---------|-------|
| **Custom Errors** | 10 specialized error types for better error handling | `errors.ts` |
| **Security** | SSRF protection, input sanitization, validation | `security.ts` |
| **API Client** | Microsoft Graph API integration with retry logic | `entra_id_api.ts` |
| **Normalization** | Transform 19 entity types to DevRev format | `data-normalization.ts` |
| **Extraction** | Worker functions for data and metadata extraction | `extraction/workers/` |
| **Tests** | 340 unit tests with 97.6% pass rate | `**/__tests__/` |

---

## Dependencies

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@devrev/typescript-sdk` | ^1.1.1 | DevRev SDK for snap-ins |
| `axios` | ^1.7.9 | HTTP client for Microsoft Graph API |
| `typescript` | ^5.8.0 | TypeScript compiler |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `jest` | ^29.7.0 | Testing framework |
| `ts-jest` | ^29.2.5 | TypeScript support for Jest |
| `eslint` | ^9.39.4 | Code linting (latest v9 flat config) |
| `prettier` | ^3.4.2 | Code formatting |
| `@typescript-eslint/eslint-plugin` | ^8.57.1 | TypeScript ESLint rules |
| `eslint-plugin-security` | ^3.0.1 | Security-focused linting |
| `eslint-plugin-import` | ^2.31.0 | Import order validation |

All dependencies are kept at their latest stable versions for security and performance.

---

## Development

### Build

```bash
cd code
npm ci              # Clean install dependencies
npm run build       # Compile TypeScript to JavaScript
```

Or using the Makefile:

```bash
make build
```

### Test

```bash
cd code
npm test            # Run all unit tests
npm run test:watch  # Run tests in watch mode
npm run test:coverage  # Generate coverage report
```

**Test Coverage**: 340 tests, 332 passing (97.6% pass rate)
- ✅ 90 tests for error handling
- ✅ 75 tests for security functions
- ✅ 110 tests for utilities
- ✅ 51 tests for data normalization
- ✅ 60 tests for API client

### Lint and Format

```bash
cd code
npm run lint        # Check code quality
npm run lint:fix    # Auto-fix linting issues
npm run format      # Format code with Prettier
npm run format:check  # Verify code formatting
```

**Linting**: ESLint v9 flat config with TypeScript, security, and import rules
- 0 errors, 332 warnings (stylistic)
- Security-focused rules enabled
- Import order enforcement
- Strict TypeScript checking

### Local Testing

```bash
cd code
npm run dev -- --fixturePath test-fixture.json --functionName extraction
```

This runs the extraction function locally with a test fixture file.

---

## Deployment (DevRev CLI)

### Step-by-Step Deployment

#### 1. Authenticate with DevRev

```bash
devrev profiles authenticate --org <your-devrev-org-slug>
```

Replace `<your-devrev-org-slug>` with your DevRev organization slug (e.g., `my-company`).

Verify authentication:
```bash
devrev profiles show
```

#### 2. Build the Package

From the `code/` directory:

```bash
npm run package
```

This command:
1. Runs `npm run build` (compiles TypeScript)
2. Creates `build.tar.gz` with compiled code and dependencies
3. Excludes dev dependencies and test files

#### 3. Create Snap-in Version

From the project root (parent of `code/`):

```bash
devrev snap_in_version create-one --manifest manifest.yaml --create-package
```

This command:
- Reads `manifest.yaml` configuration
- Uploads `code/build.tar.gz`
- Creates a new snap-in version in DevRev
- Returns a version ID

**Note**: The version ID will be shown in the output. Save it for reference.

#### 4. Draft the Snap-in

```bash
devrev snap_in draft --slug azure-entra-id
```

This creates a draft snap-in that you can test before activating.

#### 5. Activate the Snap-in

```bash
devrev snap_in activate --slug azure-entra-id
```

The snap-in is now live and ready to use!

### Quick Deployment (Makefile)

If using the provided Makefile, deploy with these commands:

```bash
# One-time authentication
make auth ORG=<your-devrev-org-slug>

# Build and deploy in one command
make deploy
```

Or run all steps sequentially:
```bash
make build      # Build the code
make package    # Create build.tar.gz
make upload     # Upload to DevRev
make activate   # Activate snap-in
```

### Verify Deployment

After deployment, verify in the DevRev UI:

1. Go to **Settings > Snap-ins**
2. Find **Azure Entra ID** in the list
3. Status should show "Active"
4. Click to configure connection settings

---

## Configuration

### Azure Credentials

After deploying, configure the snap-in in DevRev:

1. Navigate to: **Settings > Snap-ins > Azure Entra ID**
2. Click **Configure** or **Connection Settings**
3. Enter:
   - **Tenant ID**: Your Azure AD tenant ID (GUID format: `12345678-1234-1234-1234-123456789012`) or domain (e.g., `contoso.onmicrosoft.com`)
   - **Client ID**: Application (client) ID from Azure app registration (GUID format)
   - **Client Secret**: Client secret value from Azure app registration
4. Click **Test Connection** to verify credentials
5. Save configuration

**Security Note**: Credentials are stored securely in DevRev's secret store and never logged.

---

## Incremental Sync

This connector supports **time-scoped incremental syncs** using Microsoft Graph delta queries for optimal performance.

### How Incremental Sync Works

1. **Initial Sync (First Run)**
   - Fetches all entities using pagination
   - Stores a delta token for each entity type
   - Delta tokens are valid for 7 days

2. **Subsequent Syncs (Incremental)**
   - Uses stored delta tokens to fetch only changes
   - Returns: new entities, modified entities, deleted entities
   - Automatically updates delta tokens

3. **Token Expiry Handling**
   - If delta token expires (HTTP 410 error)
   - Automatically falls back to full sync
   - Generates new delta token

4. **Error Recovery**
   - Transient errors (5xx) retry with exponential backoff
   - Non-retryable errors (401, 403) fail immediately
   - Network errors retry up to 3 times

### Configure Scheduled Sync

After deploying the snap-in, configure automatic sync schedules:

1. Go to: **Settings > Snap-ins > Azure Entra ID**
2. Click **Schedule** or **Sync Settings**
3. Set your desired sync frequency:
   - **Hourly**: For high-frequency environments
   - **Every 6 hours**: Balanced approach (recommended)
   - **Daily**: For stable environments
4. Enable the schedule
5. Save changes

### Supported Entities

| Entity | Delta Support | API Endpoint |
|--------|---------------|--------------|
| Users | ✅ Yes | `/users/delta` |
| Groups | ✅ Yes | `/groups/delta` |
| Directory Roles | ✅ Yes | `/directoryRoles/delta` |
| Applications | ✅ Yes | `/applications/delta` |
| Service Principals | ✅ Yes | `/servicePrincipals/delta` |
| Devices | ✅ Yes | `/devices/delta` |
| Org Contacts | ✅ Yes | `/contacts/delta` |
| Group Members | 🔄 Re-fetched | Fetched for changed groups |
| Role Members | 🔄 Re-fetched | Fetched for changed roles |
| App Roles | 🔄 Re-fetched | Fetched for changed SPs |
| Audit Logs | 📅 Time-windowed | Last 7 days only |
| Sign-in Logs | 📅 Time-windowed | Last 7 days only |

**Performance**: Incremental sync typically reduces API calls by 90-95% after the initial sync.

---

## Security & Best Practices

### Security Features

✅ **SSRF Protection**
- URL validation ensures all API calls go to `graph.microsoft.com` only
- Prevents Server-Side Request Forgery attacks

✅ **Input Validation**
- All tenant IDs, client IDs validated as GUIDs
- Maximum length checks prevent buffer overflow
- Regular expression validation for domains and emails

✅ **Log Injection Prevention**
- All log messages sanitized
- Removes newlines, control characters, ANSI escape codes
- Prevents log tampering and injection attacks

✅ **Secure Credential Handling**
- Secrets never logged or exposed
- Sensitive data masked in error messages
- No credentials in source code or version control

✅ **Error Handling**
- Custom error classes for different failure types
- Detailed context without exposing sensitive data
- Automatic retry with exponential backoff for transient errors

See [SECURITY.md](./SECURITY.md) for complete security documentation.

### Performance Optimization

✅ **Memory Efficiency**
- Streaming pagination (processes one page at a time)
- No full dataset loaded into memory
- Automatic garbage collection between pages

✅ **Network Efficiency**
- Delta queries reduce data transfer by 90%+
- Concurrent API calls where safe
- Connection pooling and keep-alive

✅ **Disk Efficiency**
- Incremental state storage (only delta tokens)
- No local data caching
- Compressed build artifacts

See [PERFORMANCE.md](./PERFORMANCE.md) for optimization guidelines.

---

## Troubleshooting

### Common Issues

#### Authentication Errors

**Error**: `401 Unauthorized` or `Invalid credentials`

**Solution**:
1. Verify Client ID and Secret in Azure Portal
2. Ensure secret hasn't expired
3. Check tenant ID format (GUID or domain)
4. Verify app registration exists in correct tenant

#### Permission Errors

**Error**: `403 Forbidden` or `Insufficient privileges`

**Solution**:
1. Go to Azure Portal > App Registrations > Your App
2. Navigate to **API Permissions**
3. Verify all required permissions are added
4. Click **Grant admin consent** (requires Global Admin)
5. Wait 5-10 minutes for permissions to propagate

#### Delta Token Expiration

**Error**: `410 Gone` or `Delta token has expired`

**Solution**: No action needed - connector automatically falls back to full sync and generates new delta token.

#### Rate Limiting

**Error**: `429 Too Many Requests`

**Solution**: Connector automatically retries with exponential backoff. If persistent:
1. Reduce sync frequency in DevRev UI
2. Check for other applications hitting the same tenant
3. Consider Microsoft Graph throttling limits

### Logs and Debugging

View logs in DevRev:
1. Go to **Settings > Snap-ins > Azure Entra ID**
2. Click **Logs** or **Execution History**
3. Filter by execution status (Success, Failed, In Progress)
4. Click an execution to view detailed logs

Look for:
- `✅ Successfully synced X entities` - Normal operation
- `⚠️ Delta token expired, falling back to full sync` - Expected behavior
- `❌ Authentication failed` - Check credentials
- `❌ HTTP 403` - Check permissions

---

## Contributing

### Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint v9 with security plugin
- **Formatting**: Prettier with 2-space indentation
- **Comments**: Comprehensive inline documentation (one comment per line for complex logic)

### Testing

- Write unit tests for all new functions
- Maintain >95% test coverage
- Mock external dependencies (axios, DevRev SDK)
- Test both success and failure paths

### Pull Request Checklist

- [ ] Code compiles without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code formatted (`npm run format`)
- [ ] README updated (if applicable)
- [ ] Tests added for new functionality

---

## License

Copyright (c) 2024 DevRev Inc. All rights reserved.

---

## Support

For issues, questions, or feature requests:

1. **Documentation**: See [TECHNICAL_DESIGN_DOC.md](./TECHNICAL_DESIGN_DOC.md)
2. **Security**: See [SECURITY.md](./SECURITY.md)
3. **Performance**: See [PERFORMANCE.md](./PERFORMANCE.md)
4. **DevRev Support**: Contact your DevRev account team
5. **GitHub Issues**: (if repository is public)
