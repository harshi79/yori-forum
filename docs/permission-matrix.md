# Server-enforced permission matrix

Roles are loaded from Turso for the Supabase `getUser()`-verified identity by `currentActor()`/`optionalActor()`; form fields never supply actor ID or role. Service functions enforce the relevant rule even when a UI control is hidden. `ForumError` is a safe user-facing validation/authorization message. Anonymous browsing is restricted to unarchived, undeleted public content.

| Operation                                                        | Guest | User              | Moderator     | Admin         | Enforced by                                                                    |
| ---------------------------------------------------------------- | ----- | ----------------- | ------------- | ------------- | ------------------------------------------------------------------------------ |
| Browse public categories, threads, profiles and bounded search   | Yes   | Yes               | Yes           | Yes           | Public page visibility predicates; search filters archived/deleted content     |
| Edit own profile, upload/remove own avatar                       | No    | Own               | Own           | Own           | `currentActor` / `optionalActor`; `updateProfile`; avatar API key + DB user ID |
| Create thread, reply to open thread                              | No    | Yes               | Yes           | Yes           | `createThread`, `reply`; category/archive/lock checks                          |
| Edit/remove reply                                                | No    | Own within 30 min | Own or others | Own or others | `canEdit`, `editPost`, `removePost`; first post cannot be removed              |
| React, bookmark, report                                          | No    | Yes               | Yes           | Yes           | `toggleReaction`, `toggleBookmark`, `reportContent`; target visibility checks  |
| Read/mark notifications                                          | No    | Own               | Own           | Own           | User-scoped page and `markRead` predicate                                      |
| Archive own thread                                               | No    | Own               | Own           | Own           | `moderateThread` author check; moderation record for moderator action          |
| Review/resolve reports and view moderation audit                 | No    | No                | Yes           | Yes           | `canModerate` in page and `resolveReport`                                      |
| Pin, lock/unlock, restore, remove thread; moderate others' posts | No    | No                | Yes           | Yes           | `canModerate` in `moderateThread`, `canEdit` for posts                         |
| Create/update/archive category; change roles                     | No    | No                | No            | Yes           | `canAdmin` in actions and service; self-role change prohibited                 |

All mutations additionally use server-side form bounds/validation and Turso fixed-window limits. Next.js enforces Server Action origins; the avatar API has an explicit origin check. Do not treat button visibility as a security boundary. First-admin assignment is a manual verified-identity database operation, not a public API.
