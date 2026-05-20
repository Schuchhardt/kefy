[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_35JdkhXSNShHx5Put92oj6CYkXYH)](https://docs.zernio.com/)

[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_35JdkhXSNShHx5Put92oj6CYkXYH)](https://docs.zernio.com/)

Search
`⌘`  `K`

Core

profiles

accounts

connect

api keys

logs

Content & Scheduling

posts

queue

media

validate

Inbox

messages

[List conversations GET](https://docs.zernio.com/messages/list-inbox-conversations) [Create conversation POST](https://docs.zernio.com/messages/create-inbox-conversation) [List messages GET](https://docs.zernio.com/messages/get-inbox-conversation-messages) [Get conversation GET](https://docs.zernio.com/messages/get-inbox-conversation) [Update conversation status PUT](https://docs.zernio.com/messages/update-inbox-conversation) [Delete message DELETE](https://docs.zernio.com/messages/delete-inbox-message) [Add reaction POST](https://docs.zernio.com/messages/add-message-reaction) [Edit message PATCH](https://docs.zernio.com/messages/edit-inbox-message) [Mark a conversation as read POST](https://docs.zernio.com/messages/mark-conversation-read) [Remove reaction DELETE](https://docs.zernio.com/messages/remove-message-reaction) [Send message POST](https://docs.zernio.com/messages/send-inbox-message) [Send typing indicator POST](https://docs.zernio.com/messages/send-typing-indicator) [Upload media file POST](https://docs.zernio.com/messages/upload-media-direct)

comments

reviews

broadcasts

contacts

custom fields

sequences

comment automations

Analytics

analytics

Webhooks

webhooks

Advertising

ads

ad campaigns

ad audiences

tracking tags

Platform APIs

whatsapp

whatsapp phone numbers

whatsapp flows

google business profile

discord

linkedin mentions

reddit search

twitter engagement

Settings & Admin

account settings

account groups

users

invites

usage

instagram

[Dashboard](https://zernio.com/signup) [Telegram Announcements](https://t.me/zernio_dev "Telegram Announcements") [GitHub](https://github.com/zernio-dev "GitHub")

[llms.txt](https://docs.zernio.com/llms-full.txt "Full documentation for LLMs") [OpenAPI](https://docs.zernio.com/api/openapi "Download OpenAPI specification for API-first development")

[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

messages

# List conversations

Fetch conversations (DMs) from all connected messaging accounts in a single API call. Supports filtering by profile and platform. Results are aggregated and deduplicated.
Supported platforms: Facebook, Instagram, Twitter/X, Bluesky, Reddit, Telegram.

Twitter/X limitation: X has replaced traditional DMs with encrypted "X Chat" for many accounts. Messages sent or received through encrypted X Chat are not accessible via X's API (the /2/dm\_events endpoint only returns legacy unencrypted DMs). This means some Twitter/X conversations may show only outgoing messages or appear empty. This is an X platform limitation that affects all third-party applications. See X's docs on encrypted messaging for more details.

Copy for AIOpen

* * *

https://zernio.com/api

GET

``/`v1`/`inbox`/`conversations`

Send

Authorization

Query

## [Authorization](https://docs.zernio.com/messages/list-inbox-conversations\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Query Parameters](https://docs.zernio.com/messages/list-inbox-conversations\#query-parameters)

profileId?string

Filter by profile ID

platform?string

Filter by platform

Value in`"facebook" | "instagram" | "twitter" | "bluesky" | "reddit" | "telegram"`

status?string

Filter by conversation status

Value in`"active" | "archived"`

sortOrder?string

Sort order by updated time

Default`"desc"`

Value in`"asc" | "desc"`

limit?integer

Maximum number of conversations to return

Default`50`

Range`1 <= value <= 100`

cursor?string

Pagination cursor for next page

accountId?string

Filter by specific social account ID

## [Response Body](https://docs.zernio.com/messages/list-inbox-conversations\#response-body)

### 200  application/json

### 401  application/json

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

const { data } = await zernio.messages.listInboxConversations();
console.log(data);
```

200401403

```
{
  "data": [\
    {\
      "id": "string",\
      "platform": "string",\
      "accountId": "string",\
      "accountUsername": "string",\
      "participantId": "string",\
      "participantName": "string",\
      "participantPicture": "string",\
      "participantVerifiedType": "blue",\
      "lastMessage": "string",\
      "updatedTime": "2019-08-24T14:15:22Z",\
      "status": "active",\
      "unreadCount": 0,\
      "url": "string",\
      "instagramProfile": {\
        "isFollower": true,\
        "isFollowing": true,\
        "followerCount": 0,\
        "isVerified": true,\
        "fetchedAt": "2019-08-24T14:15:22Z"\
      }\
    }\
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "string"
  },
  "meta": {
    "accountsQueried": 0,
    "accountsFailed": 0,
    "failedAccounts": [\
      {\
        "accountId": "string",\
        "accountUsername": "string",\
        "platform": "string",\
        "error": "string",\
        "code": "string",\
        "retryAfter": 0\
      }\
    ],
    "lastUpdated": "2019-08-24T14:15:22Z"
  }
}
```

```
{
  "error": "Unauthorized"
}
```

Empty

[Check subreddit existence GET\\
\\
Check if a subreddit exists and return basic info (title, subscriber count, NSFW status, post types allowed).\\
\\
When accountId is provided, uses authenticated Reddit OAuth API with automatic token refresh (recommended). Falls back to Reddit's public JSON API, which may be unreliable from server IPs. Returns exists: false for private, banned, or nonexistent subreddits.](https://docs.zernio.com/validate/validate-subreddit) [Create conversation POST\\
\\
Initiate a new direct message conversation with a specified user. If a conversation already exists with the recipient, the message is added to the existing thread.\\
\\
Currently supported platforms: Twitter/X only. Other platforms will return PLATFORM\_NOT\_SUPPORTED.\\
\\
DM eligibility: Before sending, the endpoint checks if the recipient accepts DMs from your account (via the receives\_your\_dm field). If not, a 422 error with code DM\_NOT\_ALLOWED is returned. You can skip this check with skipDmCheck: true if you have already verified eligibility.\\
\\
X API tier requirement: DM write endpoints require X API Pro tier ($5,000/month) or Enterprise access. This applies to BYOK (Bring Your Own Key) users who provide their own X API credentials.\\
\\
Rate limits: 200 requests per 15 minutes, 1,000 per 24 hours per user, 15,000 per 24 hours per app (shared across all DM endpoints).](https://docs.zernio.com/messages/create-inbox-conversation)

Ask AI about Zernio API... `⌘J`