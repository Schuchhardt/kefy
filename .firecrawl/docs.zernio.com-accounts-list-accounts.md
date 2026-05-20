[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

accounts

# List accounts

Returns connected social accounts. Only includes accounts within the plan limit by default. Follower data requires analytics add-on.
Supports optional server-side pagination via page/limit params. When omitted, returns all accounts (backward-compatible).

Copy for AIOpen

* * *

https://zernio.com/api

GET

``/`v1`/`accounts`

Send

Authorization

Query

## [Authorization](https://docs.zernio.com/accounts/list-accounts\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Query Parameters](https://docs.zernio.com/accounts/list-accounts\#query-parameters)

profileId?string

Filter accounts by profile ID

platform?string

Filter accounts by platform (e.g. "instagram", "twitter").

includeOverLimit?boolean

When true, includes accounts from over-limit profiles.

Default`false`

page?integer

Page number (1-based). When provided with limit, enables server-side pagination. Omit for all accounts.

Range`1 <= value`

limit?integer

Page size. Required alongside page for pagination.

Range`1 <= value <= 100`

## [Response Body](https://docs.zernio.com/accounts/list-accounts\#response-body)

### 200  application/json

### 401  application/json

Node.js

Python

Go

Ruby

Java

PHP

.NET

Rust

cURL

```
import Zernio from '@zernio/node';

const zernio = new Zernio({ apiKey: process.env.ZERNIO_API_KEY });

const { data } = await zernio.accounts.listAccounts();
console.log(data);
```

200401

```
{
  "accounts": [\
    {\
      "_id": "64e1...",\
      "platform": "twitter",\
      "profileId": {\
        "_id": "64f0...",\
        "name": "My Brand",\
        "slug": "my-brand"\
      },\
      "username": "@acme",\
      "displayName": "Acme",\
      "profileUrl": "https://x.com/acme",\
      "isActive": true\
    }\
  ],
  "hasAnalyticsAccess": false
}
```

```
{
  "error": "Unauthorized"
}
```

[Delete profile DELETE\\
\\
Permanently deletes a profile by ID.](https://docs.zernio.com/profiles/delete-profile) [Check account health GET\\
\\
Returns detailed health info for a specific account including token status, permissions, and recommendations.](https://docs.zernio.com/accounts/get-account-health)

Ask AI about Zernio API... `⌘J`