import {
  normalizeApplication,
  normalizeDevice,
  normalizeDirectoryAuditLog,
  normalizeGroupMember,
  normalizeLicenseAssignment,
  normalizeSignInLog,
  normalizeUser,
} from '../data-normalization';
import {
  EntraApplication,
  EntraDirectoryAudit,
  EntraDevice,
  EntraDirectoryRoleMember,
  EntraLicenseDetails,
  EntraSignIn,
  EntraUser,
} from '../types';

describe('normalization contract variants', () => {
  it('keeps a user identity stable when profile fields change', () => {
    const original = {
      id: 'user-object-id',
      displayName: 'Before Rename',
      mail: 'person@example.com',
      userPrincipalName: 'person@example.com',
      givenName: 'Before',
      surname: 'Rename',
      createdDateTime: '2024-02-03T04:05:06Z',
    } as EntraUser;
    const renamed = {
      ...original,
      displayName: 'After Rename',
      givenName: 'After',
    };

    const before = normalizeUser(original);
    const after = normalizeUser(renamed);

    // Contract: Microsoft Graph v1.0 User.id is the directory object ID
    // (https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0);
    // EDM record_types.users is a separate record type. A rename must not
    // replace the source identity.
    expect(after.id).toBe(before.id);
    expect(after.id).toBe('user-object-id');
    expect(after.data.display_name).toBe('After Rename');
  });

  it('keeps membership identities independent of item order and member names', () => {
    const members: EntraDirectoryRoleMember[] = [
      { id: 'member-a', displayName: 'Original A' },
      { id: 'member-b', displayName: 'Original B' },
    ];
    const updatedInReverseOrder: EntraDirectoryRoleMember[] = [
      { id: 'member-b', displayName: 'Renamed B' },
      { id: 'member-a', displayName: 'Renamed A' },
    ];
    const normalizedIdsByMember = (items: EntraDirectoryRoleMember[]): Record<string, string> =>
      Object.fromEntries(items.map((member) => [member.id, normalizeGroupMember(member, 'group-1').id]));

    // Graph group membership is a collection of directory objects. EDM
    // group_members maps both group_id and member_id as references; connector
    // identity uses that pair rather than display name or collection position.
    expect(normalizedIdsByMember(updatedInReverseOrder)).toEqual(normalizedIdsByMember(members));
    expect(normalizedIdsByMember(members)).toEqual({
      'member-a': 'group-1_member-a',
      'member-b': 'group-1_member-b',
    });
  });

  it('names a license assignment within its owning user identity', () => {
    const license: EntraLicenseDetails = {
      id: 'license-sku-id',
      skuId: 'license-sku-id',
      skuPartNumber: 'EXAMPLE_SKU',
      servicePlans: [],
    };

    const firstUser = normalizeLicenseAssignment(license, 'user-a');
    const secondUser = normalizeLicenseAssignment(license, 'user-b');

    // Contract: Graph v1.0 licenseDetails is listed under a user
    // (https://learn.microsoft.com/en-us/graph/api/user-list-licensedetails?view=graph-rest-1.0),
    // EDM license_assignments.user_id references users, and the IDM forwards
    // that field into the matching custom object field.
    expect(firstUser.id).toBe('user-a_license-sku-id');
    expect(secondUser.id).toBe('user-b_license-sku-id');
    expect(firstUser.id).not.toBe(secondUser.id);
    expect(firstUser.data.user_id).toBe('user-a');
    expect(secondUser.data.user_id).toBe('user-b');
  });

  it('preserves a Graph dateTimeOffset with its supplied offset and precision', () => {
    const graphDateTime = '2024-02-03T04:05:06.1234567+05:30';
    const equivalentUtcDateTime = '2024-02-02T22:35:06.1234567Z';
    const device = {
      id: 'device-object-id',
      displayName: 'Timestamp Sample',
      operatingSystem: 'Windows',
      operatingSystemVersion: '11',
      trustType: 'AzureAd',
      isCompliant: true,
      isManaged: true,
      registrationDateTime: graphDateTime,
      approximateLastSignInDateTime: null,
      deviceId: 'device-id',
    } satisfies EntraDevice;

    const normalized = normalizeDevice(device);
    const equivalentDevice = normalizeDevice({
      ...device,
      registrationDateTime: equivalentUtcDateTime,
    });

    // Contract: Graph v1.0 Device.registrationDateTime is dateTimeOffset
    // (https://learn.microsoft.com/en-us/graph/api/resources/device?view=graph-rest-1.0),
    // and EDM devices.registration_date_time is a timestamp. Normalization
    // preserves its offset and fractional precision.
    expect(normalized.data.registration_date_time).toBe(graphDateTime);
    expect(equivalentDevice.data.registration_date_time).toBe(equivalentUtcDateTime);
    expect(Date.parse(normalized.data.registration_date_time as string)).toBe(
      Date.parse(equivalentDevice.data.registration_date_time as string)
    );
  });

  it('preserves defined user extension values and omits an undefined extension', () => {
    const user = {
      id: 'user-with-extension-variants',
      displayName: 'Extension Sample',
      mail: null,
      userPrincipalName: null,
      givenName: null,
      surname: null,
      jobTitle: null,
      department: null,
      officeLocation: null,
      mobilePhone: null,
      businessPhones: [],
      accountEnabled: null,
      userType: null,
      createdDateTime: '2024-02-03T04:05:06Z',
      extension_example_Boolean: false,
      extension_example_Integer: 0,
      extension_example_Empty: '',
      extension_example_Null: null,
      extension_example_Missing: undefined,
    };

    const normalized = normalizeUser(user);

    // Graph directory extensions are dynamically discovered into the EDM.
    // Connector policy includes defined extension_* values (including null,
    // false, zero, and empty string) and omits only undefined values.
    expect(normalized.data.extension_example_Boolean).toBe(false);
    expect(normalized.data.extension_example_Integer).toBe(0);
    expect(normalized.data.extension_example_Empty).toBe('');
    expect(normalized.data.extension_example_Null).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(normalized.data, 'extension_example_Missing')).toBe(false);
  });

  it('flattens multiple application identifier URIs into the EDM text field', () => {
    const application = {
      id: 'application-object-id',
      appId: 'application-client-id',
      displayName: 'URI Sample',
      signInAudience: 'AzureADMyOrg',
      createdDateTime: null,
      publisherDomain: null,
      identifierUris: ['api://second', 'api://first'],
    } satisfies EntraApplication;

    const normalized = normalizeApplication(application);

    // Contract: Graph v1.0 Application.identifierUris is a collection
    // (https://learn.microsoft.com/en-us/graph/api/resources/application?view=graph-rest-1.0);
    // the connector documents a comma-and-space join, and EDM declares the
    // resulting identifier_uris field as text.
    expect(normalized.data.identifier_uris).toBe('api://second, api://first');
  });

  it('preserves false sign-in device flags as false-valued EDM booleans', () => {
    const signIn: EntraSignIn = {
      id: 'sign-in-id',
      createdDateTime: '2024-02-03T04:05:06Z',
      userPrincipalName: null,
      userId: null,
      userDisplayName: null,
      appDisplayName: null,
      appId: null,
      ipAddress: null,
      clientAppUsed: null,
      status: null,
      location: null,
      deviceDetail: {
        isCompliant: false,
        isManaged: false,
      },
      conditionalAccessStatus: null,
      riskDetail: null,
      riskLevelAggregated: null,
      riskLevelDuringSignIn: null,
      riskState: null,
    };

    const normalized = normalizeSignInLog(signIn);

    // Contract: Graph v1.0 sign-in deviceDetail exposes isCompliant/isManaged
    // booleans (https://learn.microsoft.com/en-us/graph/api/resources/devicedetail?view=graph-rest-1.0),
    // and EDM sign_in_logs fields device_is_compliant/device_is_managed are
    // bool. The checked-in IDM has no mappings for these two fields.
    expect({
      compliant: normalized.data.device_is_compliant,
      managed: normalized.data.device_is_managed,
    }).toEqual({ compliant: false, managed: false });
  });

  it('retains all nested audit targets and their escaped text in JSON output', () => {
    const targetResources: EntraDirectoryAudit['targetResources'] = [
      {
        id: 'user-target-id',
        displayName: 'Jörg "Ops"\nTeam',
        type: 'User',
        modifiedProperties: [
          {
            displayName: 'description',
            oldValue: 'line one\nline two',
            newValue: 'Crème brûlée',
          },
        ],
      },
      {
        id: 'group-target-id',
        displayName: 'Operations',
        type: 'Group',
        modifiedProperties: [],
      },
    ];
    const audit: EntraDirectoryAudit = {
      id: 'audit-id',
      activityDateTime: '2024-02-03T04:05:06Z',
      activityDisplayName: 'Update targets',
      category: 'UserManagement',
      result: 'success',
      resultReason: null,
      initiatedBy: null,
      targetResources,
      additionalDetails: [],
    };

    const normalized = normalizeDirectoryAuditLog(audit);
    const json = normalized.data.target_resources_json;

    // Contract: Graph v1.0 directoryAudit.targetResources is a collection
    // (https://learn.microsoft.com/en-us/graph/api/resources/directoryaudit?view=graph-rest-1.0);
    // EDM directory_audit_logs stores its serialized representation in text
    // and exposes a count; the IDM forwards that text field directly.
    expect(normalized.data.target_resources_count).toBe(2);
    expect(json).toBe(JSON.stringify(targetResources));
    expect(JSON.parse(json as string)).toEqual(targetResources);
    expect(normalized.data.target_object_id).toBe('user-target-id');
  });
});
