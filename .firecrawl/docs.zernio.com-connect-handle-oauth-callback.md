[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

connect

# Complete OAuth callback

Exchange the OAuth authorization code for tokens and connect the account to the specified profile.

Copy for AIOpen

* * *

https://zernio.com/api

POST

``/`v1`/`connect`/`{platform}`

Send

Authorization

Path

Body

## [Authorization](https://docs.zernio.com/connect/handle-oauth-callback\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Path Parameters](https://docs.zernio.com/connect/handle-oauth-callback\#path-parameters)

platformstring

## [Request Body](https://docs.zernio.com/connect/handle-oauth-callback\#request-body)

application/json

codestring

statestring

profileIdstring

## [Response Body](https://docs.zernio.com/connect/handle-oauth-callback\#response-body)

### 200

### 400

### 401  application/json

### 403

### 500

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

const { data } = await zernio.connect.handleOAuthCallback({
  path: {
    platform: 'twitter',
  },
  body: {
    code: 'abc123',
    state: 'string',
    profileId: 'profile_abc123',
  },
});
console.log(data);
```

200400401403500

Empty

Empty

```
{
  "error": "Unauthorized"
}
```

Empty

Empty

[Get OAuth connect URL GET\\
\\
Initiate an OAuth connection flow. Returns an authUrl to redirect the user to.\\
Standard flow: Zernio hosts the selection UI, then redirects to your redirect\_url. Headless mode (headless=true): user is redirected to your redirect\_url with OAuth data for custom UI. Use the platform-specific selection endpoints to complete.](https://docs.zernio.com/connect/get-connect-url) [Get pending OAuth data GET\\
\\
Fetch pending OAuth data for headless mode using the pendingDataToken from the redirect URL.\\
\*\*Scope\*\*: This endpoint is used only for LinkedIn organizations and Snapchat profiles, where the selection list is too large to fit in URL params. WhatsApp, Facebook, Pinterest, Google Business and other platforms pass selection state directly via URL query params on the redirect (\`profileId\`, \`tempToken\`, \`step\`), no pending record is created, so this endpoint will return 404 for those flows. Use the platform-specific selection endpoint instead (e.g. \`/v1/connect/whatsapp/select-phone-number\`).\\
\\
Token is one-time use and expires after 10 minutes. No authentication required.](https://docs.zernio.com/connect/get-pending-oauth-data)

Ask AI about Zernio API... `⌘J`