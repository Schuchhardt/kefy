[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

posts

# List posts

Returns a paginated list of posts. Published posts include platformPostUrl with the public URL on each platform.

Copy for AIOpen

* * *

https://zernio.com/api

GET

``/`v1`/`posts`

Send

Authorization

Query

## [Authorization](https://docs.zernio.com/posts/list-posts\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Query Parameters](https://docs.zernio.com/posts/list-posts\#query-parameters)

page?integer

Page number (1-based)

Default`1`

Range`1 <= value`

limit?integer

Page size

Default`10`

Range`1 <= value <= 100`

status?string

Value in`"draft" | "scheduled" | "published" | "failed"`

platform?string

profileId?string

createdBy?string

dateFrom?string

Format`date`

dateTo?string

Format`date`

includeHidden?boolean

Default`false`

search?string

Search posts by text content.

sortBy?string

Sort order for results.

Default`"scheduled-desc"`

Value in`"scheduled-desc" | "scheduled-asc" | "created-desc" | "created-asc" | "status" | "platform"`

accountId?string

Filter posts to those published via a specific social account (24-char hex ObjectId).

## [Response Body](https://docs.zernio.com/posts/list-posts\#response-body)

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

const { data } = await zernio.posts.listPosts();
console.log(data);
```

200401

### Scheduled post (pending publish)

```
{
  "posts": [\
    {\
      "_id": "65f1c0a9e2b5af0012ab34cd",\
      "title": "Launch post",\
      "content": "We just launched!",\
      "status": "scheduled",\
      "scheduledFor": "2024-11-01T10:00:00Z",\
      "timezone": "UTC",\
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
      ],\
      "tags": [\
        "launch"\
      ],\
      "createdAt": "2024-10-01T12:00:00Z",\
      "updatedAt": "2024-10-01T12:00:00Z"\
    }\
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1
  }
}
```

### Published post with platformPostUrl

```
{
  "error": "Unauthorized"
}
```

[List activity logs GET\\
\\
Unified logs endpoint. Returns logs for publishing, connections, webhooks, and messaging.\\
Filter by type, platform, status, and time range. Logs are retained for 90 days.](https://docs.zernio.com/logs/list-logs) [Create post POST\\
\\
Create and optionally publish a post. Immediate posts (\`publishNow: true\`) include \`platformPostUrl\` in the response.\\
Content is optional when media is attached or all platforms have \`customContent\`. See each platform's schema for media constraints.\\
\## Idempotency\\
\\
Two layers of duplicate-protection apply, so safe-to-retry callers (network blips, n8n / Zapier retries, etc.) don't accidentally double-post.\\
\*\*1\. Same-request idempotency (5-minute window).\*\*\\
Pass an \`x-request-id\` header to mark a logical request. If a second request arrives with the same \`x-request-id\` while the first is in-flight (or within ~5 minutes of completion), we return \*\*HTTP 200\*\* with the original post in the \`existingPost\` field — no new post is created. The official Zernio SDKs auto-generate a unique \`x-request-id\` per call. If you're using a generic HTTP client (curl, n8n's HTTP node, Zapier, custom code), either:\\
\- Set a unique \`x-request-id\` per logical call (recommended — UUIDv4 is fine)\\
\- Or simply omit the header — we'll treat each request as new\\
\*\*Common pitfall\*\*: if your workflow tool uses a single execution-level request ID and reuses it across multiple HTTP nodes (e.g. one ID for the whole run, shared across 6 different platform calls), every call after the first will look like a retry of the first and return its post. Generate a fresh ID per node.\\
\*\*2\. Content-hash dedup (24-hour window).\*\*\\
Independently, we hash \`(platform, accountId, content + media URLs)\` and reject duplicates within 24 hours with \*\*HTTP 409\*\*. This catches genuine "same content posted twice to the same account" cases regardless of \`x-request-id\`. Returns \`error\`, \`accountId\`, \`platform\`, and \`existingPostId\` so you can find the original. To intentionally re-post identical content within 24h, change something (the caption, the media, the account) — the dedup is keyed on the full content fingerprint.\\
\\
Order: same-\`x-request-id\` retries (200) are checked first; if no idempotency match, the content-hash dedup (409) runs.](https://docs.zernio.com/posts/create-post)

Ask AI about Zernio API... `⌘J`