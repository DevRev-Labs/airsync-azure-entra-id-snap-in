# Azure Entra ID — Marketplace Submission

---

**Name:** Azure Entra ID

---

**Categories:**
Integration, Import, Automation

---

**Tagline:**
Bring your Microsoft identity and directory data into DevRev — automatically and securely.

---

**Summary:**
This connector imports identity and directory data from Azure Entra ID (Microsoft Entra ID) into DevRev, keeping your team, group, and role information always up to date. It supports incremental sync so only changes are fetched after the initial import, reducing API overhead and keeping data fresh.

---

**Overview:**

### Description

The Azure Entra ID connector bridges your Microsoft identity platform and DevRev by continuously importing users, groups, roles, devices, and more from your Azure tenant. Authentication is handled securely via OAuth 2.0 Client Credentials, requiring only an Azure AD app registration with the appropriate Microsoft Graph API permissions. Once connected, the integration runs automatically — pulling directory data one-way from Azure into DevRev with no manual intervention required.

This connector is built for enterprise environments that rely on Azure Entra ID as their source of truth for identities and access. It supports both core directory entities and advanced capabilities such as Conditional Access Policies, Lifecycle Workflows, Privileged Identity Management (PIM) roles, and audit logs — making it a comprehensive solution for organizations that need full visibility of their Microsoft identity posture within DevRev.

### Features

1. Imports users, groups, group memberships, directory roles, and role assignments from your Azure tenant.
2. Supports optional entities including applications, service principals, devices, and organizational contacts.
3. Syncs advanced data such as PIM roles, Conditional Access Policies, Lifecycle Workflows, and authentication methods.
4. Imports Directory Audit Logs and Sign-in Logs for compliance and security visibility.
5. Maps Azure directory extension attributes on users to DevRev custom fields.
6. Uses Microsoft Graph delta queries to enable efficient incremental sync — only changed records are fetched after the initial load.
7. Authenticates via OAuth 2.0 Client Credentials (Application Permissions) for secure, service-to-service connectivity.
8. Includes built-in SSRF protection, input sanitization, and comprehensive error handling for enterprise-grade reliability.

---

**Keywords:**
Azure Entra ID, Microsoft Entra, Identity Management, Directory Sync, User Import, Access Management, Microsoft Graph, Active Directory
