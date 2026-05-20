[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

connect

# Get OAuth connect URL

Initiate an OAuth connection flow. Returns an authUrl to redirect the user to.
Standard flow: Zernio hosts the selection UI, then redirects to your redirect\_url. Headless mode (headless=true): user is redirected to your redirect\_url with OAuth data for custom UI. Use the platform-specific selection endpoints to complete.

Copy for AIOpen

* * *

https://zernio.com/api

GET

``/`v1`/`connect`/`{platform}`

Send

Authorization

Path

Query

## [Authorization](https://docs.zernio.com/connect/get-connect-url\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Path Parameters](https://docs.zernio.com/connect/get-connect-url\#path-parameters)

platformstring

Social media platform to connect

Value in`"facebook" | "instagram" | "linkedin" | "twitter" | "tiktok" | "youtube" | "threads" | "reddit" | "pinterest" | "bluesky" | "googlebusiness" | "telegram" | "snapchat" | "discord" | "whatsapp"`

## [Query Parameters](https://docs.zernio.com/connect/get-connect-url\#query-parameters)

profileIdstring

Your Zernio profile ID (get from /v1/profiles)

redirect\_url?string

Your custom redirect URL after connection completes. Standard mode appends ?connected={platform}&profileId=X&accountId=Y&username=Z. Headless mode appends OAuth data params for platforms requiring selection (e.g. LinkedIn orgs, Facebook pages). If no selection is needed, the account is created directly and the redirect includes accountId.

Format`uri`

headless?boolean

When true, the user is redirected to your redirect\_url with raw OAuth data (code, state) instead of Zernio's default account selection UI. Use this to build a custom connect experience.

Default`false`

## [Response Body](https://docs.zernio.com/connect/get-connect-url\#response-body)

### 200  application/json

### 400

### 401  application/json

### 402  application/json

### 403

### 404

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

const { data } = await zernio.connect.getConnectUrl({
  path: {
    platform: 'facebook',
  },
  query: {
    profileId: 'profile_abc123',
  },
});
console.log(data);
```

200400401402403404

```
{
  "authUrl": "https://www.facebook.com/v21.0/dialog/oauth?client_id=...",
  "state": "user123-profile456-1234567890-https://yourdomain.com/callback"
}
```

Empty

```
{
  "error": "Unauthorized"
}
```

```
{
  "error": "X (Twitter) requires a payment method due to API pass-through costs. Add a payment method to connect an X account.",
  "code": "PAYMENT_REQUIRED",
  "reason": "free_tier_exceeded",
  "documentation_url": "https://docs.zernio.com/billing/payment-method-required",
  "dashboard_url": "https://zernio.com/dashboard?tab=billing",
  "details": {
    "free_tier_account_limit": 2,
    "current_account_count": 5,
    "has_payment_method": true,
    "public_account_limit": 2000,
    "effective_account_limit": 2000
  }
}
```

Empty

Empty

[Move account to a different profile PATCH\\
\\
Moves a connected social account to a different profile owned by the same\\
user. The target profile must belong to the same user as the account.\\
\\
For API keys restricted to specific profiles, BOTH the source account's\\
current profile AND the target profile must be in the key's allowed set.\\
Calls with a target profile outside the key's scope return 403.](https://docs.zernio.com/accounts/move-account-to-profile) [Complete OAuth callback POST\\
\\
Exchange the OAuth authorization code for tokens and connect the account to the specified profile.](https://docs.zernio.com/connect/handle-oauth-callback)

Ask AI about Zernio API... `⌘J`