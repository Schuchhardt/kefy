[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_HpyjhGF5B9HnKvxHW8Z5jBKgZuoC)](https://docs.zernio.com/)

[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_HpyjhGF5B9HnKvxHW8Z5jBKgZuoC)](https://docs.zernio.com/)

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

# List messages

Fetch messages for a specific conversation, with cursor-based pagination
and ordering control.

Pagination: pass `pagination.nextCursor` from a prior response back as
the `cursor` query param to fetch the next page. The cursor is opaque;
do not parse or construct it client-side.

Sort order: defaults to `asc` (oldest first, chat style). For the
"show me the latest messages" pattern, pass `?sortOrder=desc&limit=N`.
For Twitter, Facebook and Bluesky, the upstream APIs only return
newest-first and have no order parameter — sort order is best-effort
and only reverses items within a single page (pages still walk
newest→oldest). The response field `sortOrderApplied` tells you what
was actually applied.

Reddit threads are paginated client-side because Reddit's API has no
per-thread cursor. Very long threads may be upstream-truncated by
Reddit's inbox/sent windows (~100 most-recent items each); this is a
Reddit platform limitation.

Twitter/X limitation: X's encrypted "X Chat" messages are not accessible via the API. Conversations where the other participant uses encrypted X Chat may only show your outgoing messages. See the list conversations endpoint for more details.

This endpoint is read-only and does NOT mark messages as read or send
read receipts. To mark a conversation read (and send WhatsApp blue ticks
on eligible accounts), call `POST /v1/inbox/conversations/{conversationId}/read`.

Copy for AIOpen

* * *

https://zernio.com/api

GET

``/`v1`/`inbox`/`conversations`/`{conversationId}`/`messages`

Send

Authorization

Path

Query

## [Authorization](https://docs.zernio.com/messages/get-inbox-conversation-messages\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Path Parameters](https://docs.zernio.com/messages/get-inbox-conversation-messages\#path-parameters)

conversationIdstring

The conversation ID (id field from list conversations endpoint). This is the platform-specific conversation identifier, not an internal database ID.

## [Query Parameters](https://docs.zernio.com/messages/get-inbox-conversation-messages\#query-parameters)

accountIdstring

Social account ID

limit?integer

Number of messages to return per page. Default 100, max 100.

Default`100`

Range`1 <= value <= 100`

cursor?string

Opaque pagination cursor. Pass `pagination.nextCursor` from a prior response.

sortOrder?string

Order of returned messages. Default `asc` (oldest first, chat style).
For Twitter, Facebook and Bluesky, only intra-page ordering is
affected — pages always walk newest→oldest. See `sortOrderApplied`
in the response.

Default`"asc"`

Value in`"asc" | "desc"`

## [Response Body](https://docs.zernio.com/messages/get-inbox-conversation-messages\#response-body)

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

const { data } = await zernio.messages.getInboxConversationMessages({
  path: {
    conversationId: 'conversation_abc123',
  },
  query: {
    accountId: 'account_abc123',
  },
});
console.log(data);
```

200401403

```
{
  "status": "string",
  "pagination": {
    "hasMore": true,
    "nextCursor": "string"
  },
  "sortOrderApplied": "asc",
  "messages": [\
    {\
      "id": "string",\
      "conversationId": "string",\
      "accountId": "string",\
      "platform": "string",\
      "message": "string",\
      "senderId": "string",\
      "senderName": "string",\
      "senderVerifiedType": "blue",\
      "direction": "incoming",\
      "createdAt": "2019-08-24T14:15:22Z",\
      "attachments": [\
        {\
          "id": "string",\
          "type": "image",\
          "url": "string",\
          "filename": "string",\
          "previewUrl": "string"\
        }\
      ],\
      "subject": "string",\
      "storyReply": true,\
      "isStoryMention": true,\
      "isEdited": true,\
      "editedAt": "2019-08-24T14:15:22Z",\
      "editCount": 0,\
      "editHistory": [\
        {\
          "text": "string",\
          "attachments": [\
            {\
              "type": "string",\
              "url": "string",\
              "payload": {}\
            }\
          ],\
          "editedAt": "2019-08-24T14:15:22Z"\
        }\
      ],\
      "isDeleted": true,\
      "deletedAt": "2019-08-24T14:15:22Z",\
      "deliveryStatus": "sent",\
      "deliveredAt": "2019-08-24T14:15:22Z",\
      "readAt": "2019-08-24T14:15:22Z",\
      "sentAt": "2019-08-24T14:15:22Z",\
      "deliveryError": {\
        "code": 0,\
        "title": "string",\
        "message": "string"\
      }\
    }\
  ],
  "lastUpdated": "2019-08-24T14:15:22Z"
}
```

```
{
  "error": "Unauthorized"
}
```

Empty

[Create conversation POST\\
\\
Initiate a new direct message conversation with a specified user. If a conversation already exists with the recipient, the message is added to the existing thread.\\
\\
Currently supported platforms: Twitter/X only. Other platforms will return PLATFORM\_NOT\_SUPPORTED.\\
\\
DM eligibility: Before sending, the endpoint checks if the recipient accepts DMs from your account (via the receives\_your\_dm field). If not, a 422 error with code DM\_NOT\_ALLOWED is returned. You can skip this check with skipDmCheck: true if you have already verified eligibility.\\
\\
X API tier requirement: DM write endpoints require X API Pro tier ($5,000/month) or Enterprise access. This applies to BYOK (Bring Your Own Key) users who provide their own X API credentials.\\
\\
Rate limits: 200 requests per 15 minutes, 1,000 per 24 hours per user, 15,000 per 24 hours per app (shared across all DM endpoints).](https://docs.zernio.com/messages/create-inbox-conversation) [Get conversation GET\\
\\
Retrieve details and metadata for a specific conversation. Requires accountId query parameter.](https://docs.zernio.com/messages/get-inbox-conversation)

Ask AI about Zernio API... `⌘J`