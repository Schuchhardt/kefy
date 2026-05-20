[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

posts

# Create post

Create and optionally publish a post. Immediate posts (`publishNow: true`) include `platformPostUrl` in the response.
Content is optional when media is attached or all platforms have `customContent`. See each platform's schema for media constraints.

## Idempotency

Two layers of duplicate-protection apply, so safe-to-retry callers (network blips, n8n / Zapier retries, etc.) don't accidentally double-post.

**1\. Same-request idempotency (5-minute window).**
Pass an `x-request-id` header to mark a logical request. If a second request arrives with the same `x-request-id` while the first is in-flight (or within ~5 minutes of completion), we return **HTTP 200** with the original post in the `existingPost` field — no new post is created. The official Zernio SDKs auto-generate a unique `x-request-id` per call. If you're using a generic HTTP client (curl, n8n's HTTP node, Zapier, custom code), either:

- Set a unique `x-request-id` per logical call (recommended — UUIDv4 is fine)
- Or simply omit the header — we'll treat each request as new

**Common pitfall**: if your workflow tool uses a single execution-level request ID and reuses it across multiple HTTP nodes (e.g. one ID for the whole run, shared across 6 different platform calls), every call after the first will look like a retry of the first and return its post. Generate a fresh ID per node.

**2\. Content-hash dedup (24-hour window).**
Independently, we hash `(platform, accountId, content + media URLs)` and reject duplicates within 24 hours with **HTTP 409**. This catches genuine "same content posted twice to the same account" cases regardless of `x-request-id`. Returns `error`, `accountId`, `platform`, and `existingPostId` so you can find the original. To intentionally re-post identical content within 24h, change something (the caption, the media, the account) — the dedup is keyed on the full content fingerprint.

Order: same-`x-request-id` retries (200) are checked first; if no idempotency match, the content-hash dedup (409) runs.

Copy for AIOpen

* * *

https://zernio.com/api

POST

``/`v1`/`posts`

Send

Authorization

Header

Body

## [Authorization](https://docs.zernio.com/posts/create-post\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Header Parameters](https://docs.zernio.com/posts/create-post\#header-parameters)

x-request-id?string

Optional client-generated request identifier for safe retry (idempotency). When two requests carry the same value, the second is treated as a retry of the first and returns the original post (HTTP 200) instead of creating a duplicate. Window is ~5 minutes from the first request. Generate a UUID per logical call. SDKs do this automatically; HTTP clients should set it themselves or omit it. See the operation description for the full idempotency contract.

Format`uuid`

## [Request Body](https://docs.zernio.com/posts/create-post\#request-body)

application/json

title?string

content?string

Post caption/text. Optional when media is attached or all platforms have customContent. Required for text-only posts.

mediaItems?array<object>

platforms?array<object>

Target platforms and accounts for this post. Required for non-draft posts (returns 400 if empty). Drafts can omit platforms.

scheduledFor?string

Format`date-time`

publishNow?boolean

Default`false`

isDraft?boolean

When true, saves the post as a draft. When none of scheduledFor, publishNow, or queuedFromProfile are provided, the post defaults to draft automatically.

Default`false`

timezone?string

Default`"UTC"`

tags?array<string>

Tags/keywords. YouTube constraints: each tag max 100 chars, combined max 500 chars, duplicates auto-removed.

hashtags?array<string>

mentions?array<string>

Stored for reference only. This field does NOT automatically create @mentions when publishing. For LinkedIn @mentions, use the /v1/accounts/{accountId}/linkedin-mentions endpoint to resolve profile URLs to URNs, then embed the returned mentionFormat directly in the post content field.

crosspostingEnabled?boolean

Default`true`

metadata?object

tiktokSettings?TikTokPlatformData

Root-level TikTok settings applied to all TikTok platforms. Merged into each platform's platformSpecificData, with platform-specific settings taking precedence.

facebookSettings?FacebookPlatformData

Root-level Facebook settings applied to all Facebook platforms. Merged into each platform's platformSpecificData, with platform-specific settings taking precedence.

recycling?RecyclingConfig

Configure automatic post recycling (reposting at regular intervals).
After the post is published, the system creates new scheduled copies at the
specified interval until expiration conditions are met. Supports weekly or
monthly intervals. Maximum 10 active recycling posts per account.
YouTube and TikTok platforms are excluded from recycling.
Content variations are recommended for Twitter and Pinterest to avoid duplicate flags.

queuedFromProfile?string

Profile ID to schedule via queue. When provided without scheduledFor, the post is auto-assigned to the next available slot. Do not call /v1/queue/next-slot and use that time in scheduledFor, as that bypasses queue locking.

queueId?string

Specific queue ID to use when scheduling via queue.
Only used when queuedFromProfile is also provided.
If omitted, uses the profile's default queue.

## [Response Body](https://docs.zernio.com/posts/create-post\#response-body)

### 201  application/json

### 400  application/json

### 401  application/json

### 403  application/json

### 409  application/json

### 429  application/json

Facebook draft post (visible in Publishing Tools)

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

const { data } = await zernio.posts.createPost({
  body: {
    title: 'Example',
    content: 'Hello, world!',
    mediaItems: [\
      {\
        type: 'image',\
        url: 'https://example.com',\
      },\
    ],
  },
});
console.log(data);
```

201400401403409429

### Scheduled post (URLs populated after publish time)

```
{
  "post": {
    "_id": "65f1c0a9e2b5af0012ab34cd",
    "title": "Launch post",
    "content": "We just launched!",
    "status": "scheduled",
    "scheduledFor": "2024-11-01T10:00:00Z",
    "timezone": "UTC",
    "platforms": [\
      {\
        "platform": "twitter",\
        "accountId": {\
          "_id": "64e1f0...",\
          "platform": "twitter",\
          "username": "@acme",\
          "displayName": "Acme Corp",\
          "isActive": true\
        },\
        "status": "pending"\
      }\
    ]
  },
  "message": "Post scheduled successfully"
}
```

### Immediate post with publishNow=true (URLs included)

### Post scheduled via queue (using queuedFromProfile)

```
{
  "error": "string"
}
```

```
{
  "error": "Unauthorized"
}
```

```
{
  "error": "string"
}
```

```
{
  "error": "This exact content is already scheduled, publishing, or was posted to this account within the last 24 hours.",
  "details": {
    "accountId": "string",
    "platform": "string",
    "existingPostId": "string"
  }
}
```

```
{
  "error": "string",
  "details": {}
}
```

[List posts GET\\
\\
Returns a paginated list of posts. Published posts include platformPostUrl with the public URL on each platform.](https://docs.zernio.com/posts/list-posts) [Get post GET\\
\\
Fetch a single post by ID. For published posts, this returns platformPostUrl for each platform.](https://docs.zernio.com/posts/get-post)

Ask AI about Zernio API... `⌘J`