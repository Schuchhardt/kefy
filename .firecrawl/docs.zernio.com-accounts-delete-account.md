[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

accounts

# Disconnect account

Disconnects and removes a connected social account.

Copy for AIOpen

* * *

https://zernio.com/api

DELETE

``/`v1`/`accounts`/`{accountId}`

Send

Authorization

Path

## [Authorization](https://docs.zernio.com/accounts/delete-account\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Path Parameters](https://docs.zernio.com/accounts/delete-account\#path-parameters)

accountIdstring

## [Response Body](https://docs.zernio.com/accounts/delete-account\#response-body)

### 200  application/json

### 401  application/json

### 404  application/json

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

const { data } = await zernio.accounts.deleteAccount({
  path: {
    accountId: 'account_abc123',
  },
});
console.log(data);
```

200401404

```
{
  "message": "Account disconnected successfully"
}
```

```
{
  "error": "Unauthorized"
}
```

```
{
  "error": "Not found"
}
```

[Update account PUT\\
\\
Updates a connected social account's display name or username override.\\
\\
For X/Twitter accounts on usage-based billing, also accepts an \`xCapabilities\`\\
object to toggle background API operations that incur X API pass-through costs.\\
Both fields are opt-in (default \`false\`) — when off, no analytics syncs or DM\\
polling are performed for that account, and no API call is metered for those\\
operations. Publishing and deleting posts are always available regardless of\\
these toggles. Setting \`xCapabilities\` on a non-X account returns 400.](https://docs.zernio.com/accounts/update-account) [Move account to a different profile PATCH\\
\\
Moves a connected social account to a different profile owned by the same\\
user. The target profile must belong to the same user as the account.\\
\\
For API keys restricted to specific profiles, BOTH the source account's\\
current profile AND the target profile must be in the key's allowed set.\\
Calls with a target profile outside the key's scope return 403.](https://docs.zernio.com/accounts/move-account-to-profile)

Ask AI about Zernio API... `⌘J`