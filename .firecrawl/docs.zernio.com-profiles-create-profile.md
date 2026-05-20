[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

profiles

# Create profile

Creates a new profile with a name, optional description, and color.

Copy for AIOpen

* * *

https://zernio.com/api

POST

``/`v1`/`profiles`

Send

Authorization

Body

## [Authorization](https://docs.zernio.com/profiles/create-profile\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Request Body](https://docs.zernio.com/profiles/create-profile\#request-body)

application/json

namestring

description?string

color?string

## [Response Body](https://docs.zernio.com/profiles/create-profile\#response-body)

### 201  application/json

### 400

### 401  application/json

### 402  application/json

### 403

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

const { data } = await zernio.profiles.createProfile({
  body: {
    name: 'Example',
  },
});
console.log(data);
```

201400401402403

```
{
  "message": "Profile created successfully",
  "profile": {
    "_id": "64f0a1b2c3d4e5f6a7b8c9d0",
    "userId": "6507a1b2c3d4e5f6a7b8c9d0",
    "name": "Marketing Team",
    "description": "Profile for marketing campaigns",
    "color": "#4CAF50",
    "isDefault": false,
    "createdAt": "2024-11-01T10:00:00Z"
  }
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

[List profiles GET\\
\\
Returns profiles sorted by creation date. Use includeOverLimit=true to include profiles that exceed the plan limit.](https://docs.zernio.com/profiles/list-profiles) [Get profile GET\\
\\
Returns a single profile by ID, including its name, color, and default status.](https://docs.zernio.com/profiles/get-profile)

Ask AI about Zernio API... `⌘J`