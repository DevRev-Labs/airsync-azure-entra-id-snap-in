---

## L001 — Bootstrap delta state and model relationship removals

**Date:** 2026-09-30
**Source:** LABS-579 investigation of Entra ID user, group, and membership updates not reaching DevRev
**Problem:** Initial extraction used ordinary list endpoints, so Microsoft Graph delta links were never established, and user/group records reused their creation timestamp as `modified_date`. Membership extraction emitted only current relationships, so removing a user from a group produced no operation for DevRev.
**Fix:** Bootstrap users and groups through delta endpoints, stamp delta changes with the sync timestamp, and consume `members@delta` removals by mapping `remove_member_ids` to `object_member.remove_member_ids`.
