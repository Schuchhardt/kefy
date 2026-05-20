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

# Send message

Send a message in a conversation. Supports text, attachments, quick replies,
buttons, templates, and message tags. Attachment and interactive message
support varies by platform.

WhatsApp rich interactive messages (list, CTA URL, Flow) are available via
the `interactive` field. Tap events are delivered through the
`message.received` webhook with WhatsApp-specific `metadata` fields
(`interactiveType`, `interactiveId`, `flowResponseJson`, `flowResponseData`).

Copy for AIOpen

* * *

https://zernio.com/api

POST

``/`v1`/`inbox`/`conversations`/`{conversationId}`/`messages`

Send

Authorization

Path

Body

## [Authorization](https://docs.zernio.com/messages/send-inbox-message\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Path Parameters](https://docs.zernio.com/messages/send-inbox-message\#path-parameters)

conversationIdstring

The conversation ID (id field from list conversations endpoint). This is the platform-specific conversation identifier, not an internal database ID.

## [Request Body](https://docs.zernio.com/messages/send-inbox-message\#request-body)

application/json

accountIdstring

Social account ID

message?string

Message text

attachmentUrl?string

URL of the attachment to send (image, video, audio, or file). The URL must be publicly accessible. For binary file uploads, use multipart/form-data instead.

attachmentType?string

Type of attachment. Defaults to file if not specified.

Value in`"image" | "video" | "audio" | "file"`

quickReplies?array<object>

Quick reply buttons. Mutually exclusive with buttons. Max 13 items.

Items`items <= 13`

buttons?array<object>

Action buttons. Mutually exclusive with quickReplies. Max 3 items.

Items`items <= 3`

template?object

Generic template for carousels (Instagram/Facebook only, ignored on Telegram).

interactive?object

WhatsApp-only. Rich interactive payload for list messages, CTA URL
buttons, and Flow prompts. When set, takes priority over `buttons`
and `quickReplies`. The shape mirrors Meta's Cloud API `interactive`
object verbatim, so any payload that works against Meta directly
will also work here.

Use `buttons` / `quickReplies` for simple button replies
(WhatsApp's `interactive.type: "button"`) — the abstraction caps at
3 buttons and handles the auto-conversion for you. Use this field
only for `list`, `cta_url`, or `flow` messages.

Tap events come back via the `message.received` webhook with
`metadata.interactiveType` set to `list_reply` or `nfm_reply`.

replyMarkup?object

Telegram-native keyboard markup. Ignored on other platforms.

messagingType?string

Facebook messaging type. Required when using messageTag.

Value in`"RESPONSE" | "UPDATE" | "MESSAGE_TAG"`

messageTag?string

Facebook message tag for messaging outside 24h window. Requires messagingType MESSAGE\_TAG. Instagram only supports HUMAN\_AGENT.

Value in`"CONFIRMED_EVENT_UPDATE" | "POST_PURCHASE_UPDATE" | "ACCOUNT_UPDATE" | "HUMAN_AGENT"`

replyTo?string

Platform message ID to quote-reply to. For WhatsApp, pass the wamid (available in message.platformMessageId from webhooks). For Telegram, pass the Telegram message ID.

## [Response Body](https://docs.zernio.com/messages/send-inbox-message\#response-body)

### 200  application/json

### 400  application/json

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

const { data } = await zernio.messages.sendInboxMessage({
  path: {
    conversationId: 'conversation_abc123',
  },
  body: {
    accountId: 'account_abc123',
  },
});
console.log(data);
```

200400401403

```
{
  "success": true,
  "data": {
    "messageId": "string",
    "conversationId": "string",
    "sentAt": "2019-08-24T14:15:22Z",
    "message": "string"
  }
}
```

```
{
  "error": "string",
  "code": "PLATFORM_LIMITATION"
}
```

```
{
  "error": "Unauthorized"
}
```

Empty

[Remove reaction DELETE\\
\\
Remove a reaction from a message. Platform support:\\
\- Telegram: Send empty reaction array to clear\\
\- WhatsApp: Send empty emoji to remove\\
\- All others: Returns 400 (not supported)](https://docs.zernio.com/messages/remove-message-reaction) [Send typing indicator POST\\
\\
Show a typing indicator in a conversation. Platform support:\\
\- Facebook Messenger: Shows "Page is typing..." for 20 seconds\\
\- Telegram: Shows "Bot is typing..." for 5 seconds\\
\- WhatsApp: Shows "typing..." for up to 25 seconds. Requires a recent inbound message in the conversation (Meta references the inbound message id) and also marks that message as read as a side-effect.\\
\- All others: Returns 200 but no-op (platform doesn't support it)\\
\\
Typing indicators are best-effort. The endpoint always returns 200 even if the platform call fails.](https://docs.zernio.com/messages/send-typing-indicator)

Ask AI about Zernio API... `⌘J`