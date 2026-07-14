[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_5zStfeAzCUJ8Ua8LRpYh377eZZPs)](https://docs.zernio.com/)

[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_5zStfeAzCUJ8Ua8LRpYh377eZZPs)](https://docs.zernio.com/)

Search
`⌘`  `K`

[Quickstart](https://docs.zernio.com/)

[SDKs](https://docs.zernio.com/sdks)

[CLI](https://docs.zernio.com/cli)

[MCP](https://docs.zernio.com/mcp)

[Webhooks](https://docs.zernio.com/webhooks)

Guides

[Connecting Accounts](https://docs.zernio.com/guides/connecting-accounts) [Multi-Tenant Integration](https://docs.zernio.com/guides/multi-tenant) [Media Uploads](https://docs.zernio.com/guides/media-uploads) [Queue Scheduling](https://docs.zernio.com/guides/queue-scheduling) [Timezones & Scheduling](https://docs.zernio.com/guides/timezones) [Idempotency & Safe Retries](https://docs.zernio.com/guides/idempotency) [Post Lifecycle](https://docs.zernio.com/guides/post-lifecycle) [Error Handling](https://docs.zernio.com/guides/error-handling) [Rate Limits](https://docs.zernio.com/guides/rate-limits) [Platform Settings](https://docs.zernio.com/guides/platform-settings)

[Pricing](https://docs.zernio.com/pricing) [Billing](https://docs.zernio.com/billing) [Changelog](https://docs.zernio.com/changelog) [Refer & earn](https://docs.zernio.com/refer-and-earn)

[Dashboard](https://zernio.com/signup) [Telegram Announcements](https://t.me/zernio_dev "Telegram Announcements") [GitHub](https://github.com/zernio-dev "GitHub")

[llms.txt](https://docs.zernio.com/llms-full.txt "Full documentation for LLMs") [OpenAPI](https://docs.zernio.com/api/openapi "Download OpenAPI specification for API-first development")

[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

Platform SettingsTwitter/X

Guides

# Platform Settings

Configure Twitter threads, Instagram Stories, TikTok privacy, YouTube visibility, and LinkedIn settings when posting via the Zernio API.

Copy for AIOpen

* * *

When creating posts, you can provide platform-specific settings in the `platformSpecificData` field of each `PlatformTarget`. This allows you to customize how your content appears and behaves on each social network.

* * *

## [Twitter/X](https://docs.zernio.com/guides/platform-settings\#twitterx)

Create multi-tweet threads with Twitter's `threadItems` array.

| Property | Type | Description |
| --- | --- | --- |
| `threadItems` | array | Sequence of tweets in a thread. First item is the root tweet. |
| `threadItems[].content` | string | Tweet text content |
| `threadItems[].mediaItems` | array | Media attachments for this tweet |
| `geoRestriction` | object | Restrict media visibility to specific countries. Only applies when media is attached (ignored for text-only tweets). The tweet text remains visible globally. |
| `geoRestriction.countries` | string\[\] | Uppercase ISO 3166-1 alpha-2 codes, max 25. Example: `["US", "ES"]` |

```
{
  "threadItems": [\
    { "content": "🧵 Here's everything you need to know about our API..." },\
    { "content": "1/ First, authentication is simple..." },\
    { "content": "2/ Next, create your first post..." }\
  ]
}
```

* * *

## [Threads (by Meta)](https://docs.zernio.com/guides/platform-settings\#threads-by-meta)

Similar to Twitter, create multi-post threads on Threads.

| Property | Type | Description |
| --- | --- | --- |
| `threadItems` | array | Sequence of posts (root then replies in order) |
| `threadItems[].content` | string | Post text content |
| `threadItems[].mediaItems` | array | Media attachments for this post |

* * *

## [Facebook](https://docs.zernio.com/guides/platform-settings\#facebook)

| Property | Type | Description |
| --- | --- | --- |
| `contentType` | `"story"` | Publish as a Facebook Page Story (24-hour ephemeral) |
| `firstComment` | string | Auto-post a first comment (feed posts only, not stories) |
| `pageId` | string | Target Page ID for multi-page posting. Use `GET /v1/accounts/{id}/facebook-page` to list available pages. Uses default page if omitted. |
| `geoRestriction` | object | Restrict post visibility to specific countries (hard restriction). `geoRestriction.countries`: array of uppercase ISO 3166-1 alpha-2 codes, max 25. Not supported for stories. |

**Constraints:**

- ❌ Cannot mix videos and images in the same post
- ✅ Up to 10 images for feed posts
- ✅ Stories require media (single image or video)
- ⚠️ Story text captions are not displayed
- ⏱️ Stories disappear after 24 hours
- 📄 Use `pageId` to post to multiple Facebook Pages from the same account connection

```
{
  "contentType": "story",
  "pageId": "123456789"
}
```

* * *

## [Instagram](https://docs.zernio.com/guides/platform-settings\#instagram)

| Property | Type | Description |
| --- | --- | --- |
| `contentType` | `"story"` | Publish as an Instagram Story |
| `shareToFeed` | boolean | For Reels only. When `true` (default), the Reel appears on both the Reels tab and profile feed. Set to `false` for Reels tab only. |
| `collaborators` | string\[\] | Up to 3 usernames to invite as collaborators (feed/Reels only) |
| `firstComment` | string | Auto-post a first comment (not applied to Stories) |
| `trialParams` | object | Trial Reels configuration (Reels only). Trial Reels are initially shared only with non-followers. |
| `trialParams.graduationStrategy` | `"MANUAL"` \| `"SS_PERFORMANCE"` | `MANUAL`: graduate via Instagram app. `SS_PERFORMANCE`: auto-graduate based on performance. |
| `userTags` | array | Tag Instagram users in photos by username and position coordinates (not supported for stories or videos). For carousels, use `mediaIndex` to tag specific slides (defaults to 0). |
| `userTags[].username` | string | Instagram username (@ symbol optional, auto-removed) |
| `userTags[].x` | number | X coordinate from left edge (0.0–1.0) |
| `userTags[].y` | number | Y coordinate from top edge (0.0–1.0) |
| `userTags[].mediaIndex` | integer | Zero-based carousel slide index to tag (defaults to 0). Tags targeting video items or out-of-range indices are ignored. |
| `audioName` | string | Custom name for the original audio in Reels. Replaces the default "Original Audio" label. Only applies to Reels (video posts). Can only be set once - either during creation or later from the Instagram audio page in the app. |
| `thumbOffset` | integer | Millisecond offset from the start of the video to use as the Reel thumbnail. Only applies to Reels. If a custom thumbnail URL (`instagramThumbnail` in mediaItems) is provided, it takes priority. Defaults to 0 (first frame). |

**Constraints:**

- 📐 Feed posts require aspect ratio between **0.8** (4:5) and **1.91** (1.91:1)
- 📱 9:16 images must use `contentType: "story"`
- 🎠 Carousels support up to 10 media items
- 🗜️ Images > 8MB auto-compressed
- 📹 Story videos > 100MB auto-compressed
- 🎬 Reel videos > 300MB auto-compressed
- 🏷️ User tags: supported on images only (not stories/videos); for carousels, use `userTags[].mediaIndex` to tag specific slides (defaults to 0)

```
{
  "firstComment": "Link in bio! 🔗",
  "collaborators": ["brandpartner", "creator123"],
  "userTags": [\
    { "username": "friend_username", "x": 0.5, "y": 0.5 }\
  ]
}
```

* * *

## [LinkedIn](https://docs.zernio.com/guides/platform-settings\#linkedin)

| Property | Type | Description |
| --- | --- | --- |
| `organizationUrn` | string | Target LinkedIn Organization URN for multi-organization posting. Format: `urn:li:organization:123456789`. Use `GET /v1/accounts/{id}/linkedin-organizations` to list available organizations. Uses default organization if omitted. |
| `firstComment` | string | Auto-post a first comment |
| `disableLinkPreview` | boolean | Set `true` to disable URL previews (default: `false`) |
| `geoRestriction` | object | Restrict post visibility to specific countries (hard restriction). Organization pages only, requires 300+ targeted followers. |
| `geoRestriction.countries` | string\[\] | Uppercase ISO 3166-1 alpha-2 codes, max 25. Example: `["US", "ES"]` |

**Constraints:**

- ✅ Up to 20 images per post
- ❌ Multi-video posts not supported
- 📄 Single PDF document posts supported
- 🔗 Link previews auto-generated when no media attached
- 🏢 Use `organizationUrn` to post to multiple organizations from the same account connection

```
{
  "firstComment": "What do you think? Drop a comment below! 👇",
  "disableLinkPreview": false
}
```

* * *

## [Reddit](https://docs.zernio.com/guides/platform-settings\#reddit)

| Property | Type | Description |
| --- | --- | --- |
| `subreddit` | string | Target subreddit name (without "r/" prefix). Overrides the default subreddit configured on the account connection. |
| `title` | string | Post title (max 300 chars). Defaults to the first line of content, truncated to 300 characters. |
| `url` | string (URI) | URL for link posts. If provided (and forceSelf is not true), creates a link post instead of a text post. |
| `forceSelf` | boolean | When true, creates a text/self post even when a URL or media is provided. |
| `flairId` | string | Flair ID for the post (required by some subreddits). Use `GET /v1/accounts/{id}/reddit-flairs?subreddit=name` to list available flairs. |
| `nativeVideo` | boolean | Defaults to `true` for video media items (uploads to Reddit's CDN, renders as embedded player). Set `false` to post as a plain link instead. Subreddits that block videos fall back automatically. |
| `videogif` | boolean | When `true`, submit the native video as a silent looping videogif. |
| `videoPosterUrl` | string (URI) | Custom poster/thumbnail. If omitted, Zernio auto-extracts the video's first frame. |

* * *

## [Pinterest](https://docs.zernio.com/guides/platform-settings\#pinterest)

| Property | Type | Description |
| --- | --- | --- |
| `title` | string | Pin title (max 100 chars, defaults to first line of content) |
| `boardId` | string | Target board ID (uses first available if omitted) |
| `link` | string (URI) | Destination link for the pin |
| `coverImageUrl` | string (URI) | Cover image for video pins |
| `coverImageKeyFrameTime` | integer | Key frame time in seconds for video cover |

```
{
  "title": "10 Tips for Better Photography",
  "boardId": "board-123",
  "link": "https://example.com/photography-tips"
}
```

* * *

## [YouTube](https://docs.zernio.com/guides/platform-settings\#youtube)

| Property | Type | Description |
| --- | --- | --- |
| `title` | string | Video title (max 100 chars, defaults to first line of content) |
| `visibility` | `"public"` \| `"private"` \| `"unlisted"` | Video visibility (default: `public`) |
| `madeForKids` | boolean | COPPA compliance: Set to `true` if video is made for kids (child-directed content). Defaults to `false`. Videos marked as made for kids have restricted features (no comments, no notifications, limited ad targeting). |
| `firstComment` | string | Auto-post a first comment (max 10,000 chars) |
| `tags` | string\[\] | Tags/keywords for the video (see constraints below) |
| `containsSyntheticMedia` | boolean | AI-generated content disclosure flag. Set to true if your video contains AI-generated or synthetic content that could be mistaken for real people, places, or events. This helps viewers understand when realistic content has been created or altered using AI. YouTube may add a label to videos when this is set. Added to YouTube Data API in October 2024. |
| `categoryId` | string | YouTube video category ID. Defaults to `"22"` (People & Blogs). Common categories: `"1"` (Film & Animation), `"2"` (Autos & Vehicles), `"10"` (Music), `"15"` (Pets & Animals), `"17"` (Sports), `"20"` (Gaming), `"22"` (People & Blogs), `"23"` (Comedy), `"24"` (Entertainment), `"25"` (News & Politics), `"26"` (Howto & Style), `"27"` (Education), `"28"` (Science & Technology). |

**Tag Constraints:**

- ✅ No count limit; duplicates are automatically removed
- 📏 Each tag must be ≤ 100 characters
- 📊 Combined total across all tags ≤ 500 characters (YouTube's limit)

**Automatic Detection:**

- ⏱️ Videos ≤ 3 minutes → **YouTube Shorts**
- 🎬 Videos > 3 minutes → **Regular videos**
- 🖼️ Custom thumbnails supported for regular videos only
- ❌ Custom thumbnails NOT supported for Shorts via API
- 👶 `madeForKids` defaults to `false` (not child-directed)

```
{
  "title": "How to Use Our API in 5 Minutes",
  "visibility": "public",
  "madeForKids": false,
  "firstComment": "Thanks for watching! 🙏 Subscribe for more tutorials!"
}
```

* * *

## [TikTok](https://docs.zernio.com/guides/platform-settings\#tiktok)

> ⚠️ **Required Consent**: TikTok posts will fail without `content_preview_confirmed: true` and `express_consent_given: true`.

TikTok settings are nested inside `platformSpecificData.tiktokSettings`:

| Property | Type | Description |
| --- | --- | --- |
| `privacy_level` | string | **Required.** Must be one from your account's available options |
| `allow_comment` | boolean | **Required.** Allow comments on the post |
| `allow_duet` | boolean | Required for video posts |
| `allow_stitch` | boolean | Required for video posts |
| `content_preview_confirmed` | boolean | **Required.** Must be `true` |
| `express_consent_given` | boolean | **Required.** Must be `true` |
| `draft` | boolean | Send to Creator Inbox as draft instead of publishing |
| `description` | string | Long-form description for photo posts (max 4000 chars) |
| `video_cover_timestamp_ms` | integer | Thumbnail frame timestamp in ms (default: 1000) |
| `photo_cover_index` | integer | Cover image index for carousels (0-based, default: 0) |
| `auto_add_music` | boolean | Let TikTok add recommended music (photos only) |
| `video_made_with_ai` | boolean | Disclose AI-generated content |
| `commercial_content_type` | `"none"` \| `"brand_organic"` \| `"brand_content"` | Commercial disclosure |
| `brand_partner_promote` | boolean | Brand partner promotion flag |
| `is_brand_organic_post` | boolean | Brand organic post flag |
| `media_type` | `"video"` \| `"photo"` | Optional override (defaults based on media items) |

**Constraints:**

- 📸 Photo carousels support up to 35 images
- 📝 Video titles: up to 2200 characters
- 📝 Photo titles: auto-truncated to 90 chars (use `description` for longer text)
- 🔒 `privacy_level` must match your account's available options (no defaults)

```
{
  "accountId": "tiktok-012",
  "platformSpecificData": {
    "tiktokSettings": {
      "privacy_level": "PUBLIC_TO_EVERYONE",
      "allow_comment": true,
      "allow_duet": true,
      "allow_stitch": true,
      "content_preview_confirmed": true,
      "express_consent_given": true,
      "description": "Full description here since photo titles are limited to 90 chars..."
    }
  }
}
```

* * *

## [Google Business Profile](https://docs.zernio.com/guides/platform-settings\#google-business-profile)

| Property | Type | Description |
| --- | --- | --- |
| `topicType` | `"STANDARD"` \| `"EVENT"` \| `"OFFER"` | Post type. Defaults to `STANDARD` if omitted. `EVENT` requires the `event` object. `OFFER` requires `offer` and optionally `event` for the offer period. |
| `event` | object | Event details. Required for `EVENT`, optional for `OFFER`. See schedule format below. |
| `event.title` | string | Event or offer title displayed on Google Search and Maps |
| `event.schedule` | object | Date/time range. Contains `startDate`, `startTime`, `endDate`, `endTime`. Each date field accepts `{ year, month, day }` or an ISO 8601 string (e.g., `"2026-05-15T09:00:00Z"`). Time fields accept `{ hours, minutes }` or an ISO string. |
| `offer` | object | Offer details for `OFFER` posts. All sub-fields optional. |
| `offer.couponCode` | string | Promo/coupon code |
| `offer.redeemOnlineUrl` | string (URI) | URL where the offer can be redeemed online |
| `offer.termsConditions` | string | Terms and conditions text |
| `locationId` | string | Target Google Business location ID for multi-location posting. Format: `locations/123456789`. Use `GET /v1/accounts/{id}/gmb-locations` to list available locations. Uses default location if omitted. |
| `languageCode` | string | BCP 47 language code for the post content (e.g., `en`, `de`, `es`, `fr`). If omitted, language is auto-detected from the post text. |
| `callToAction.type` | enum | `LEARN_MORE`, `BOOK`, `ORDER`, `SHOP`, `SIGN_UP`, `CALL` |
| `callToAction.url` | string (URI) | Destination URL for the CTA button |

**Constraints:**

- ✅ Text content + single image only
- ❌ Videos not supported
- 🔗 CTA button drives user engagement
- 📍 Posts appear on Google Search/Maps
- 🗺️ Use `locationId` to post to multiple locations from the same account connection

```
{
  "topicType": "EVENT",
  "event": {
    "title": "Grand Opening Weekend",
    "schedule": {
      "startDate": { "year": 2026, "month": 5, "day": 15 },
      "startTime": { "hours": 9, "minutes": 0 },
      "endDate": { "year": 2026, "month": 5, "day": 16 },
      "endTime": { "hours": 17, "minutes": 0 }
    }
  },
  "callToAction": {
    "type": "LEARN_MORE",
    "url": "https://example.com/grand-opening"
  }
}
```

* * *

## [Telegram](https://docs.zernio.com/guides/platform-settings\#telegram)

| Property | Type | Description |
| --- | --- | --- |
| `parseMode` | `"HTML"` \| `"Markdown"` \| `"MarkdownV2"` | Text formatting mode (default: `HTML`) |
| `disableWebPagePreview` | boolean | Set `true` to disable link previews |
| `disableNotification` | boolean | Send message silently (no notification sound) |
| `protectContent` | boolean | Prevent forwarding and saving of the message |

**Constraints:**

- 📸 Up to 10 images per post (media album)
- 🎬 Up to 10 videos per post (media album)
- 📝 Text-only posts: up to 4096 characters
- 🖼️ Media captions: up to 1024 characters
- 👤 Channel posts show channel name/logo as author
- 🤖 Group posts show "Zernio" as the bot author
- 📊 Analytics not available via API (Telegram limitation)

```
{
  "parseMode": "HTML",
  "disableWebPagePreview": false,
  "disableNotification": false,
  "protectContent": true
}
```

* * *

## [Snapchat](https://docs.zernio.com/guides/platform-settings\#snapchat)

| Property | Type | Description |
| --- | --- | --- |
| `contentType` | `"story"` \| `"saved_story"` \| `"spotlight"` | Type of Snapchat content (default: `story`) |

**Content Types:**

- **Story** (default): Ephemeral snap visible for 24 hours. No caption/text supported.
- **Saved Story**: Permanent story saved to your Public Profile. Uses post content as title (max 45 chars).
- **Spotlight**: Video for Snapchat's entertainment feed. Supports description (max 160 chars) with hashtags.

**Constraints:**

- 👤 Requires a Snapchat Public Profile
- 🖼️ Media required for all content types (no text-only posts)
- 1️⃣ Only one media item per post
- 📸 Images: max 20 MB, JPEG/PNG format
- 🎬 Videos: max 500 MB, MP4 format, 5-60 seconds, min 540x960px
- 📐 Aspect ratio: 9:16 recommended
- 🔒 Media is automatically encrypted (AES-256-CBC) before upload

```
{
  "contentType": "saved_story"
}
```

* * *

## [Bluesky](https://docs.zernio.com/guides/platform-settings\#bluesky)

Bluesky doesn't require `platformSpecificData` but has important constraints:

**Constraints:**

- 🖼️ Up to 4 images per post
- 🗜️ Images > ~1MB are automatically recompressed to meet Bluesky's blob size limit
- 🔗 Link previews auto-generated when no media is attached

```
{
  "content": "Just posted this via the Zernio API! 🦋",
  "platforms": [\
    {\
      "platform": "bluesky",\
      "accountId": "bluesky-123"\
    }\
  ]
}
```

* * *

## [Complete Example](https://docs.zernio.com/guides/platform-settings\#complete-example)

Here's a real-world example posting to multiple platforms with platform-specific settings:

```
{
  "content": "Excited to announce our new product! 🎉",
  "mediaItems": [\
    { "url": "https://example.com/product.jpg", "type": "image" }\
  ],
  "platforms": [\
    {\
      "platform": "twitter",\
      "accountId": "twitter-123",\
      "platformSpecificData": {\
        "threadItems": [\
          { "content": "Excited to announce our new product! 🎉" },\
          { "content": "Here's what makes it special... 🧵" }\
        ]\
      }\
    },\
    {\
      "platform": "instagram",\
      "accountId": "instagram-456",\
      "platformSpecificData": {\
        "firstComment": "Link in bio! 🔗",\
        "collaborators": ["brandpartner"]\
      }\
    },\
    {\
      "platform": "linkedin",\
      "accountId": "linkedin-789",\
      "platformSpecificData": {\
        "firstComment": "What features would you like to see next? 👇"\
      }\
    },\
    {\
      "platform": "tiktok",\
      "accountId": "tiktok-012",\
      "platformSpecificData": {\
        "tiktokSettings": {\
          "privacy_level": "PUBLIC_TO_EVERYONE",\
          "allow_comment": true,\
          "allow_duet": false,\
          "allow_stitch": false,\
          "content_preview_confirmed": true,\
          "express_consent_given": true\
        }\
      }\
    },\
    {\
      "platform": "youtube",\
      "accountId": "youtube-345",\
      "platformSpecificData": {\
        "title": "New Product Announcement",\
        "visibility": "public",\
        "firstComment": "Thanks for watching! Subscribe for updates! 🔔"\
      }\
    },\
    {\
      "platform": "googlebusiness",\
      "accountId": "gbp-678",\
      "platformSpecificData": {\
        "topicType": "EVENT",\
        "event": {\
          "title": "New Product Launch",\
          "schedule": {\
            "startDate": { "year": 2026, "month": 6, "day": 1 },\
            "startTime": { "hours": 10, "minutes": 0 },\
            "endDate": { "year": 2026, "month": 6, "day": 1 },\
            "endTime": { "hours": 18, "minutes": 0 }\
          }\
        },\
        "callToAction": {\
          "type": "SHOP",\
          "url": "https://example.com/product"\
        }\
      }\
    },\
    {\
      "platform": "telegram",\
      "accountId": "telegram-901",\
      "platformSpecificData": {\
        "parseMode": "HTML",\
        "disableNotification": false,\
        "protectContent": false\
      }\
    },\
    {\
      "platform": "snapchat",\
      "accountId": "snapchat-234",\
      "platformSpecificData": {\
        "contentType": "saved_story"\
      }\
    }\
  ]
}
```

[Rate Limits\\
\\
API rate limits by plan, posting velocity limits, and how to handle throttling](https://docs.zernio.com/guides/rate-limits) [Pricing\\
\\
Pay-per-account pricing, first 2 accounts free, then graduated rates with everything included](https://docs.zernio.com/pricing)

### On this page

[Twitter/X](https://docs.zernio.com/guides/platform-settings#twitterx) [Threads (by Meta)](https://docs.zernio.com/guides/platform-settings#threads-by-meta) [Facebook](https://docs.zernio.com/guides/platform-settings#facebook) [Instagram](https://docs.zernio.com/guides/platform-settings#instagram) [LinkedIn](https://docs.zernio.com/guides/platform-settings#linkedin) [Reddit](https://docs.zernio.com/guides/platform-settings#reddit) [Pinterest](https://docs.zernio.com/guides/platform-settings#pinterest) [YouTube](https://docs.zernio.com/guides/platform-settings#youtube) [TikTok](https://docs.zernio.com/guides/platform-settings#tiktok) [Google Business Profile](https://docs.zernio.com/guides/platform-settings#google-business-profile) [Telegram](https://docs.zernio.com/guides/platform-settings#telegram) [Snapchat](https://docs.zernio.com/guides/platform-settings#snapchat) [Bluesky](https://docs.zernio.com/guides/platform-settings#bluesky) [Complete Example](https://docs.zernio.com/guides/platform-settings#complete-example)

Ask AI about Zernio API... `⌘J`