[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_76rrkSuGpEqNjCbNDEFr3zjAzPjp)](https://docs.zernio.com/)

[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_76rrkSuGpEqNjCbNDEFr3zjAzPjp)](https://docs.zernio.com/)

Search
`⌘`  `K`

[Overview](https://docs.zernio.com/platforms)

Social Posting

[Twitter/X](https://docs.zernio.com/platforms/twitter)

[Instagram](https://docs.zernio.com/platforms/instagram) [Facebook](https://docs.zernio.com/platforms/facebook) [LinkedIn](https://docs.zernio.com/platforms/linkedin) [TikTok](https://docs.zernio.com/platforms/tiktok) [YouTube](https://docs.zernio.com/platforms/youtube) [Pinterest](https://docs.zernio.com/platforms/pinterest) [Reddit](https://docs.zernio.com/platforms/reddit) [Bluesky](https://docs.zernio.com/platforms/bluesky) [Threads](https://docs.zernio.com/platforms/threads)

[Google Business](https://docs.zernio.com/platforms/google-business)

[Snapchat](https://docs.zernio.com/platforms/snapchat)

Messaging

[WhatsApp](https://docs.zernio.com/platforms/whatsapp)

[Telegram](https://docs.zernio.com/platforms/telegram) [Discord](https://docs.zernio.com/platforms/discord)

Telephony

[Phone Numbers](https://docs.zernio.com/platforms/phone-numbers)

[Voice & Calls](https://docs.zernio.com/platforms/voice)

[SMS](https://docs.zernio.com/platforms/sms)

Advertising

[Meta Ads](https://docs.zernio.com/platforms/meta-ads)

[Google Ads](https://docs.zernio.com/platforms/google-ads) [LinkedIn Ads](https://docs.zernio.com/platforms/linkedin-ads) [TikTok Ads](https://docs.zernio.com/platforms/tiktok-ads) [Pinterest Ads](https://docs.zernio.com/platforms/pinterest-ads) [X Ads](https://docs.zernio.com/platforms/x-ads)

[Dashboard](https://zernio.com/signup) [Telegram Announcements](https://t.me/zernio_dev "Telegram Announcements") [GitHub](https://github.com/zernio-dev "GitHub")

[llms.txt](https://docs.zernio.com/llms-full.txt "Full documentation for LLMs") [OpenAPI](https://docs.zernio.com/api/openapi "Download OpenAPI specification for API-first development")

[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

InstagramQuick Reference

# Instagram

Schedule and automate Instagram posts with Zernio API - Feed, Stories, Reels, Carousels, collaborators, and user tags

Copy for AIOpen

* * *

## [Quick Reference](https://docs.zernio.com/platforms/instagram\#quick-reference)

| Property | Value |
| --- | --- |
| Character limit | 2,200 (caption) |
| Images per post | 1 (feed), 10 (carousel) |
| Videos per post | 1 |
| Image formats | JPEG, PNG |
| Image max size | 8 MB (auto-compressed) |
| Video formats | MP4, MOV |
| Video max size | 300 MB (feed/reels), 100 MB (stories) |
| Video max duration | 90 sec (reels), 60 min (feed), 60 sec (story) |
| Post types | Feed, Carousel, Story, Reel |
| Scheduling | Yes |
| Inbox (DMs) | Yes |
| Inbox (Comments) | Yes (reply-only) |
| Comment-to-DM automations | Yes |
| Story-reply automations | Yes |
| Analytics | Yes |

## [Before You Start](https://docs.zernio.com/platforms/instagram\#before-you-start)

Instagram **requires** a Business or Creator account. Personal accounts cannot post via API.

Google Drive, Dropbox, OneDrive, and iCloud links **do not work** as media URLs. These services return HTML pages, not media files. Instagram's servers cannot fetch media from them. Use direct CDN URLs or upload via Zernio's [media endpoint](https://docs.zernio.com/guides/media-uploads).

Additional requirements:

- Media is required for all posts (no text-only)
- 100 posts per 24-hour rolling window (all content types combined)
- First 125 characters of caption are visible before the "more" fold

## [OAuth Scopes](https://docs.zernio.com/platforms/instagram\#oauth-scopes)

Zernio connects Instagram through Instagram Login for Business, so all scopes are from the `instagram_business_*` family:

| Scope | What it enables |
| --- | --- |
| `instagram_business_basic` | Account identity and basic profile data |
| `instagram_business_content_publish` | Publish posts, reels, stories and carousels |
| `instagram_business_manage_insights` | Post and account analytics |
| `instagram_business_manage_comments` | Read and reply to comments (including the first-comment feature) |
| `instagram_business_manage_messages` | Instagram DMs in the inbox |

Instagram Login can't grant ads permissions (`ads_management` and related scopes exist only on Facebook Login), so connecting an Instagram account never requests them. Ads on Instagram-owned posts use the token of a [Facebook](https://docs.zernio.com/platforms/facebook) account connected in the same profile; see [Meta Ads](https://docs.zernio.com/platforms/meta-ads).

Zernio requests all scopes in a single OAuth flow when the account is connected (see [Connecting Accounts](https://docs.zernio.com/guides/connecting-accounts)); scopes cannot be requested individually. To check what a connected account can currently do, call [Account Health](https://docs.zernio.com/accounts/get-all-accounts-health): it reports posting and analytics capability derived from the scopes the user actually granted.

## [Quick Start](https://docs.zernio.com/platforms/instagram\#quick-start)

Post an image to Instagram in under 60 seconds:

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Check out this photo!',
  mediaItems: [\
    { type: 'image', url: 'https://cdn.example.com/photo.jpg' }\
  ],
  platforms: [\
    { platform: 'instagram', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true
});
console.log('Posted to Instagram!', post._id);
```

```
result = client.posts.create_post(
    content="Check out this photo!",
    media_items=[\
        {"type": "image", "url": "https://cdn.example.com/photo.jpg"}\
    ],
    platforms=[\
        {"platform": "instagram", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True
)
post = result.post
print(f"Posted to Instagram! {post['_id']}")
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Check out this photo!",
    "mediaItems": [\
      {"type": "image", "url": "https://cdn.example.com/photo.jpg"}\
    ],
    "platforms": [\
      {"platform": "instagram", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true
  }'
```

## [Content Types](https://docs.zernio.com/platforms/instagram\#content-types)

### [Feed Post](https://docs.zernio.com/platforms/instagram\#feed-post)

A single image or video in the main feed. Best aspect ratio is 4:5 (portrait), but 1:1 (square) and 1.91:1 (landscape) are also supported. No `contentType` field is needed -- feed is the default.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Beautiful sunset today #photography',
  mediaItems: [\
    { type: 'image', url: 'https://cdn.example.com/sunset.jpg' }\
  ],
  platforms: [\
    { platform: 'instagram', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true
});
console.log('Feed post created!', post._id);
```

```
result = client.posts.create_post(
    content="Beautiful sunset today #photography",
    media_items=[\
        {"type": "image", "url": "https://cdn.example.com/sunset.jpg"}\
    ],
    platforms=[\
        {"platform": "instagram", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True
)
post = result.post
print(f"Feed post created! {post['_id']}")
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Beautiful sunset today #photography",
    "mediaItems": [\
      {"type": "image", "url": "https://cdn.example.com/sunset.jpg"}\
    ],
    "platforms": [\
      {"platform": "instagram", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true
  }'
```

### [Carousel](https://docs.zernio.com/platforms/instagram\#carousel)

Up to 10 mixed image/video items. All items should share the same aspect ratio -- the first item determines the ratio for the entire carousel.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Trip highlights from last weekend',
  mediaItems: [\
    { type: 'image', url: 'https://cdn.example.com/photo1.jpg' },\
    { type: 'image', url: 'https://cdn.example.com/photo2.jpg' },\
    { type: 'video', url: 'https://cdn.example.com/clip.mp4' },\
    { type: 'image', url: 'https://cdn.example.com/photo3.jpg' }\
  ],
  platforms: [\
    { platform: 'instagram', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true
});
console.log('Carousel posted!', post._id);
```

```
result = client.posts.create_post(
    content="Trip highlights from last weekend",
    media_items=[\
        {"type": "image", "url": "https://cdn.example.com/photo1.jpg"},\
        {"type": "image", "url": "https://cdn.example.com/photo2.jpg"},\
        {"type": "video", "url": "https://cdn.example.com/clip.mp4"},\
        {"type": "image", "url": "https://cdn.example.com/photo3.jpg"}\
    ],
    platforms=[\
        {"platform": "instagram", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True
)
post = result.post
print(f"Carousel posted! {post['_id']}")
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Trip highlights from last weekend",
    "mediaItems": [\
      {"type": "image", "url": "https://cdn.example.com/photo1.jpg"},\
      {"type": "image", "url": "https://cdn.example.com/photo2.jpg"},\
      {"type": "video", "url": "https://cdn.example.com/clip.mp4"},\
      {"type": "image", "url": "https://cdn.example.com/photo3.jpg"}\
    ],
    "platforms": [\
      {"platform": "instagram", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true
  }'
```

### [Story](https://docs.zernio.com/platforms/instagram\#story)

Set `contentType: "story"` to publish to Stories. Stories disappear after 24 hours, text captions are not displayed, and link stickers are not available via the API (this is a limitation of Instagram's Graph API, not Zernio).

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  mediaItems: [\
    { type: 'image', url: 'https://cdn.example.com/story.jpg' }\
  ],
  platforms: [{\
    platform: 'instagram',\
    accountId: 'YOUR_ACCOUNT_ID',\
    platformSpecificData: {\
      contentType: 'story'\
    }\
  }],
  publishNow: true
});
console.log('Story posted!', post._id);
```

```
result = client.posts.create_post(
    media_items=[\
        {"type": "image", "url": "https://cdn.example.com/story.jpg"}\
    ],
    platforms=[{\
        "platform": "instagram",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
            "contentType": "story"\
        }\
    }],
    publish_now=True
)
post = result.post
print(f"Story posted! {post['_id']}")
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mediaItems": [\
      {"type": "image", "url": "https://cdn.example.com/story.jpg"}\
    ],
    "platforms": [{\
      "platform": "instagram",\
      "accountId": "YOUR_ACCOUNT_ID",\
      "platformSpecificData": {\
        "contentType": "story"\
      }\
    }],
    "publishNow": true
  }'
```

### [Reel](https://docs.zernio.com/platforms/instagram\#reel)

Set `contentType: "reels"` to publish a Reel, or let Zernio auto-detect it from vertical 9:16 video under 90 seconds. Reels must be vertical (9:16) and no longer than 90 seconds.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'New tutorial is up!',
  mediaItems: [\
    { type: 'video', url: 'https://cdn.example.com/reel.mp4' }\
  ],
  platforms: [{\
    platform: 'instagram',\
    accountId: 'YOUR_ACCOUNT_ID',\
    platformSpecificData: {\
      contentType: 'reels',\
      shareToFeed: true\
    }\
  }],
  publishNow: true
});
console.log('Reel posted!', post._id);
```

```
result = client.posts.create_post(
    content="New tutorial is up!",
    media_items=[\
        {"type": "video", "url": "https://cdn.example.com/reel.mp4"}\
    ],
    platforms=[{\
        "platform": "instagram",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
            "contentType": "reels",\
            "shareToFeed": True\
        }\
    }],
    publish_now=True
)
post = result.post
print(f"Reel posted! {post['_id']}")
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "New tutorial is up!",
    "mediaItems": [\
      {"type": "video", "url": "https://cdn.example.com/reel.mp4"}\
    ],
    "platforms": [{\
      "platform": "instagram",\
      "accountId": "YOUR_ACCOUNT_ID",\
      "platformSpecificData": {\
        "contentType": "reels",\
        "shareToFeed": true\
      }\
    }],
    "publishNow": true
  }'
```

## [Media Requirements](https://docs.zernio.com/platforms/instagram\#media-requirements)

### [Images](https://docs.zernio.com/platforms/instagram\#images)

| Property | Feed Post | Story | Carousel |
| --- | --- | --- | --- |
| **Max images** | 1 | 1 | 10 |
| **Formats** | JPEG, PNG | JPEG, PNG | JPEG, PNG |
| **Max file size** | 8 MB | 8 MB | 8 MB each |
| **Recommended** | 1080 x 1350 px | 1080 x 1920 px | 1080 x 1080 px |

#### [Aspect Ratios](https://docs.zernio.com/platforms/instagram\#aspect-ratios)

| Orientation | Ratio | Dimensions | Notes |
| --- | --- | --- | --- |
| Portrait | 4:5 | 1080 x 1350 px | Best engagement for feed posts |
| Square | 1:1 | 1080 x 1080 px | Standard feed and carousel |
| Landscape | 1.91:1 | 1080 x 566 px | Widest allowed for feed |
| Vertical | 9:16 | 1080 x 1920 px | Stories and Reels only |

Feed posts accept aspect ratios between 0.8 (4:5) and 1.91 (1.91:1). Images outside that range must be posted as Stories or Reels.

### [Videos](https://docs.zernio.com/platforms/instagram\#videos)

| Property | Feed | Reel | Story |
| --- | --- | --- | --- |
| **Formats** | MP4, MOV | MP4, MOV | MP4, MOV |
| **Max file size** | 300 MB | 300 MB | 100 MB |
| **Max duration** | 60 min | 90 sec | 60 sec |
| **Min duration** | 3 sec | 3 sec | 3 sec |
| **Aspect ratio** | 4:5 to 1.91:1 | 9:16 | 9:16 |
| **Resolution** | 1080 px wide | 1080 x 1920 px | 1080 x 1920 px |
| **Codec** | H.264 | H.264 | H.264 |
| **Frame rate** | 30 fps | 30 fps | 30 fps |

Oversized media is auto-compressed. Images above 8 MB, videos above 300 MB (feed/reels) or 100 MB (stories) are compressed automatically. Original files are preserved.

## [Platform-Specific Fields](https://docs.zernio.com/platforms/instagram\#platform-specific-fields)

All fields go inside `platformSpecificData` on the Instagram platform entry.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `contentType` | `"story"` \| `"reels"` | (feed) | Omit for regular feed post. Set to `"story"` for Stories or `"reels"` for Reels. |
| `shareToFeed` | boolean | `true` | Reel-specific. Set to `false` to show the Reel in the Reels tab only, not the main feed. |
| `collaborators` | Array<string> | -- | Up to 3 usernames. Must be public Business/Creator accounts. Does not work with Stories. |
| `userTags` | Array<{username, x, y, mediaIndex?}> | -- | Tag users in images (not videos). Coordinates are 0.0 to 1.0. `mediaIndex` targets a specific carousel slide (0-based, defaults to 0). |
| `trialParams` | {graduationStrategy} | -- | Trial Reels, shown only to non-followers. `graduationStrategy` is `"MANUAL"` or `"SS_PERFORMANCE"` (auto-graduate if it performs well). |
| `thumbOffset` | number (ms) | `0` | Millisecond offset from video start to use as thumbnail. Ignored if `instagramThumbnail` is set. |
| `instagramThumbnail` | string (URL) | -- | Custom thumbnail for Reels. JPEG or PNG, recommended 1080 x 1920 px. Takes priority over `thumbOffset`. |
| `audioName` | string | -- | Custom audio name for Reels (replaces "Original Audio"). Can only be set at creation. |
| `isAiGenerated` | boolean | `false` | When `true`, Instagram labels the post as containing AI-generated media. Applies to feed posts, Reels, Stories, and carousels. |
| `firstComment` | string | -- | Auto-posted as the first comment. Works with feed posts and carousels, not Stories. Useful for links since captions do not have clickable links. |

## [AI-Generated Media Label](https://docs.zernio.com/platforms/instagram\#ai-generated-media-label)

Use `isAiGenerated: true` to self-disclose AI-generated media so Instagram can apply its AI-generated label. This is intended for AI-generated **media** (images/video), not AI-written captions.

> **Note:** This setting applies to feed posts, Reels, Stories, and carousels.

curlJavaScriptPython

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "New concept art (AI-generated)",
    "mediaItems": [\
      {"type": "image", "url": "https://cdn.example.com/ai-image.jpg"}\
    ],
    "platforms": [{\
      "platform": "instagram",\
      "accountId": "YOUR_ACCOUNT_ID",\
      "platformSpecificData": {\
        "isAiGenerated": true\
      }\
    }],
    "publishNow": true
  }'
```

```
const { post } = await zernio.posts.createPost({
  content: 'New concept art (AI-generated)',
  mediaItems: [\
    { type: 'image', url: 'https://cdn.example.com/ai-image.jpg' }\
  ],
  platforms: [{\
    platform: 'instagram',\
    accountId: 'YOUR_ACCOUNT_ID',\
    platformSpecificData: {\
      isAiGenerated: true\
    }\
  }],
  publishNow: true
});
console.log('Posted with AI-generated label!', post._id);
```

```
result = client.posts.create_post(
    content="New concept art (AI-generated)",
    media_items=[\
        {"type": "image", "url": "https://cdn.example.com/ai-image.jpg"}\
    ],
    platforms=[{\
        "platform": "instagram",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
            "isAiGenerated": True\
        }\
    }],
    publish_now=True
)
post = result.post
print(f"Posted with AI-generated label! {post['_id']}")
```

## [Media URL Requirements](https://docs.zernio.com/platforms/instagram\#media-url-requirements)

**These do not work as media URLs:**

- **Google Drive** \-\- returns an HTML download page, not the file
- **Dropbox** \-\- returns an HTML preview page
- **OneDrive / SharePoint** \-\- returns HTML
- **iCloud** \-\- returns HTML

Test your URL in an incognito browser window. If you see a webpage instead of the raw image or video, it will not work.

Media URLs must be:

- Publicly accessible (no authentication required)
- Returning actual media bytes with the correct `Content-Type` header
- Not behind redirects that resolve to HTML pages
- Hosted on a fast, reliable CDN

**Supabase URLs:** Zernio auto-proxies Supabase storage URLs, so they work without additional configuration.

## [Analytics](https://docs.zernio.com/platforms/instagram\#analytics)

> **Included** — Analytics is bundled with every paid account on the [Usage plan](https://docs.zernio.com/pricing).

Available metrics via the [Analytics API](https://docs.zernio.com/analytics/get-analytics):

| Metric | Available |
| --- | --- |
| Impressions | ✅ |
| Reach | ✅ |
| Likes | ✅ |
| Comments | ✅ |
| Shares | ✅ |
| Saves | ✅ |
| Views | ✅ |

Instagram also provides dedicated analytics endpoints for deeper insights:

- **[Account Insights](https://docs.zernio.com/analytics/get-instagram-account-insights)** \-\- Account-level reach, views, accounts engaged, total interactions, follows\_and\_unfollows, profile links taps. Business or Creator accounts only. Note: only reach supports metricType=time\_series; all other metrics (including follows\_and\_unfollows) are total\_value only (Instagram API limitation).
- **[Follower History](https://docs.zernio.com/analytics/get-instagram-follower-history)** \-\- Daily running follower count time series plus followers\_gained and followers\_lost deltas. Served from Zernio's daily snapshotter since Instagram removed follower\_count from its /insights endpoint in Graph API v22+ and never exposed a historical daily series.
- **[Demographics](https://docs.zernio.com/analytics/get-instagram-demographics)** \-\- Audience breakdowns by age, city, country, or gender. Requires at least 100 followers.

### [Stories](https://docs.zernio.com/platforms/instagram\#stories)

Stories live for 24 hours. Zernio exposes two endpoints to read them while they're alive plus persists final-state metrics via Meta's `story_insights` webhook so insights remain queryable after the story expires.

- **[List active stories](https://docs.zernio.com/instagram/list-instagram-stories)** \-\- `GET /v1/accounts/{accountId}/instagram/stories` returns the currently-active stories with `mediaType`, `permalink`, `mediaUrl`, `thumbnailUrl`, and `timestamp`. Live videos, reshared stories, and copyright-flagged media are excluded by Meta. `caption`, `likeCount`, and `commentsCount` do not apply to story media.
- **[Story insights](https://docs.zernio.com/instagram/get-instagram-story-insights)** \-\- `GET /v1/accounts/{accountId}/instagram/stories/{storyId}/insights` returns `views`, `reach`, `replies`, `shares`, `profileVisits`, `follows`, `totalInteractions`, and the navigation breakdown (`tapsForward`, `tapsBack`, `exits`, `swipesForward`). The response includes a `source` field of `live` (story still active, fetched from Meta), `cached` (story expired but its `story_insights` webhook payload was captured), or `unavailable` (expired and no webhook payload was captured -- typical when the account connected after the story expired). Counts below 5 may be returned as 0 due to Meta's privacy floor on small audiences.

Node.jsPythoncurl

```
const analytics = await zernio.analytics.getAnalytics({
  platform: 'instagram',
  fromDate: '2024-01-01',
  toDate: '2024-01-31'
});
console.log(analytics.posts);
```

```
analytics = client.analytics.get_analytics(
    platform="instagram",
    from_date="2024-01-01",
    to_date="2024-01-31"
)
print(analytics["posts"])
```

```
curl "https://zernio.com/api/v1/analytics?platform=instagram&fromDate=2024-01-01&toDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## [What You Can't Do](https://docs.zernio.com/platforms/instagram\#what-you-cant-do)

These features are not available through Instagram's API:

- Add music to Reels
- Use story stickers (polls, questions, links, countdowns)
- Add location tags
- Go Live
- Create Guides
- Apply filters
- Tag products
- Post to personal accounts (Business or Creator only)
- Create top-level comments (reply-only through the API)

## [Common Errors](https://docs.zernio.com/platforms/instagram\#common-errors)

Instagram has a **10.2% failure rate** across Zernio's platform (35,634 failures out of 348,438 attempts). Here are the most frequent errors and how to fix them:

| Error | Meaning | Fix |
| --- | --- | --- |
| "Cannot process video from this URL. Instagram cannot fetch videos from Google Drive, Dropbox, or OneDrive." | A cloud storage sharing link was used instead of a direct media URL | Use a direct CDN URL. Test in an incognito window -- if you see a webpage, it will not work. |
| "You have reached the maximum of 100 posts per day." | Instagram's hard 24-hour rolling limit | Reduce posting volume. This limit includes all content types (feed, stories, reels, carousels). |
| "Instagram blocked your request." | Automation detection triggered | Reduce posting frequency, vary content. Wait before retrying. |
| "Duplicate content detected." | Identical content was already published recently | Modify the caption or media before retrying. |
| "Media fetch failed, retrying... (failed after 3 attempts)" | Zernio could not download media from the provided URL | Verify the URL is publicly accessible and returns actual media bytes, not an HTML page. |
| "Instagram access token expired." | The OAuth token for this account has expired | Reconnect the account. Subscribe to the `account.disconnected` webhook to catch this proactively. |

## [Inbox](https://docs.zernio.com/platforms/instagram\#inbox)

> **Included** — Inbox (DMs, comments, reviews) is bundled with every paid account on the [Usage plan](https://docs.zernio.com/pricing).

Instagram supports DMs and comments with some limitations.

### [Direct Messages](https://docs.zernio.com/platforms/instagram\#direct-messages)

| Feature | Supported |
| --- | --- |
| List conversations | ✅ |
| Fetch messages | ✅ |
| Send text messages | ✅ |
| Send attachments | ✅ (images, videos, audio via URL) |
| Quick replies | ✅ (up to 13, Meta quick\_replies) |
| Buttons | ✅ (up to 3, generic template) |
| Carousels | ✅ (generic template, up to 10 elements) |
| Message tags | ✅ (`HUMAN_AGENT` only) |
| Archive/unarchive | ✅ |

**Attachment limits:** 8 MB images, 25 MB video/audio. Attachments are automatically uploaded to temp storage and sent as URLs.

**Message tags:** Use `messageTag: "HUMAN_AGENT"` with `messagingType: "MESSAGE_TAG"` to send messages outside the 24-hour messaging window.

#### [Instagram Profile Data](https://docs.zernio.com/platforms/instagram\#instagram-profile-data)

Instagram conversations include an optional `instagramProfile` object on participants and webhook senders, useful for routing and automation:

| Field | Type | Description |
| --- | --- | --- |
| `isFollower` | boolean | Whether the participant follows your business account |
| `isFollowing` | boolean | Whether your business account follows the participant |
| `followerCount` | integer | The participant's follower count |
| `isVerified` | boolean | Whether the participant is a verified Instagram user |
| `fetchedAt` | datetime | When this data was last fetched (conversations only) |

Available in:

- `GET /v1/inbox/conversations` and `GET /v1/inbox/conversations/{id}` \- on each participant
- `message.received` webhook - on `message.sender`

### [Ice Breakers](https://docs.zernio.com/platforms/instagram\#ice-breakers)

Manage ice breaker prompts shown when users start a new Instagram DM conversation. Max 4 ice breakers, question max 80 characters.

See [Account Settings](https://docs.zernio.com/account-settings/get-instagram-ice-breakers) for the `GET/PUT/DELETE /v1/accounts/{accountId}/instagram-ice-breakers` endpoints.

### [Comments](https://docs.zernio.com/platforms/instagram\#comments)

| Feature | Supported |
| --- | --- |
| List comments on posts | ✅ |
| Post new top-level comment | ❌ (reply-only) |
| Reply to comments | ✅ |
| Delete comments | ✅ |
| Like comments | ❌ (deprecated since 2018) |
| Hide/unhide comments | ✅ |
| Send private reply (DM after comment) | ✅ (text + up to 13 quick replies OR 1-3 inline buttons, 7-day window, one per comment) |

### [Webhooks](https://docs.zernio.com/platforms/instagram\#webhooks)

Instagram emits the full set of message lifecycle webhooks:

| Event | When it fires |
| --- | --- |
| `message.received` | New incoming DM |
| `message.sent` | Outgoing DM is sent |
| `message.edited` | The sender edits a previously-sent message |
| `message.deleted` | The sender unsends a message |
| `message.read` | The customer reads an outgoing DM |

Messages are stored locally via webhooks. See the [Webhooks](https://docs.zernio.com/webhooks) page for payload details.

**`message.deleted` note:** the payload retains the original `text` and `attachments` so API consumers can access pre-delete content for moderation or compliance use cases. The Zernio dashboard UI hides that content.

### [Limitations](https://docs.zernio.com/platforms/instagram\#limitations)

- **Reply-only comments** \- Cannot post new top-level comments, only replies to existing comments
- **No comment likes** \- Liking comments was deprecated in 2018

See [Messages](https://docs.zernio.com/messages/list-inbox-conversations) and [Comments](https://docs.zernio.com/comments/list-inbox-comments) API Reference for endpoint details.

## [Related Endpoints](https://docs.zernio.com/platforms/instagram\#related-endpoints)

- [Connect Instagram Account](https://docs.zernio.com/guides/connecting-accounts) \- OAuth flow via Facebook Business
- [Create Post](https://docs.zernio.com/posts/create-post) \- Post creation and scheduling
- [Upload Media](https://docs.zernio.com/guides/media-uploads) \- Image and video uploads
- [Analytics](https://docs.zernio.com/analytics/get-analytics) \- Post performance metrics
- [Messages](https://docs.zernio.com/messages/list-inbox-conversations) and [Comments](https://docs.zernio.com/comments/list-inbox-comments) \- Inbox API
- [Account Settings](https://docs.zernio.com/account-settings/get-instagram-ice-breakers) \- Ice breakers configuration

[Limits & Errors\\
\\
What you cannot do and common errors](https://docs.zernio.com/platforms/twitter/reference) [Facebook\\
\\
Schedule and automate Facebook Page posts with Zernio API - Feed posts, Stories, multi-image, multi-link carousels, GIFs, and first comments](https://docs.zernio.com/platforms/facebook)

### On this page

[Quick Reference](https://docs.zernio.com/platforms/instagram#quick-reference) [Before You Start](https://docs.zernio.com/platforms/instagram#before-you-start) [OAuth Scopes](https://docs.zernio.com/platforms/instagram#oauth-scopes) [Quick Start](https://docs.zernio.com/platforms/instagram#quick-start) [Content Types](https://docs.zernio.com/platforms/instagram#content-types) [Feed Post](https://docs.zernio.com/platforms/instagram#feed-post) [Carousel](https://docs.zernio.com/platforms/instagram#carousel) [Story](https://docs.zernio.com/platforms/instagram#story) [Reel](https://docs.zernio.com/platforms/instagram#reel) [Media Requirements](https://docs.zernio.com/platforms/instagram#media-requirements) [Images](https://docs.zernio.com/platforms/instagram#images) [Aspect Ratios](https://docs.zernio.com/platforms/instagram#aspect-ratios) [Videos](https://docs.zernio.com/platforms/instagram#videos) [Platform-Specific Fields](https://docs.zernio.com/platforms/instagram#platform-specific-fields) [AI-Generated Media Label](https://docs.zernio.com/platforms/instagram#ai-generated-media-label) [Media URL Requirements](https://docs.zernio.com/platforms/instagram#media-url-requirements) [Analytics](https://docs.zernio.com/platforms/instagram#analytics) [Stories](https://docs.zernio.com/platforms/instagram#stories) [What You Can't Do](https://docs.zernio.com/platforms/instagram#what-you-cant-do) [Common Errors](https://docs.zernio.com/platforms/instagram#common-errors) [Inbox](https://docs.zernio.com/platforms/instagram#inbox) [Direct Messages](https://docs.zernio.com/platforms/instagram#direct-messages) [Instagram Profile Data](https://docs.zernio.com/platforms/instagram#instagram-profile-data) [Ice Breakers](https://docs.zernio.com/platforms/instagram#ice-breakers) [Comments](https://docs.zernio.com/platforms/instagram#comments) [Webhooks](https://docs.zernio.com/platforms/instagram#webhooks) [Limitations](https://docs.zernio.com/platforms/instagram#limitations) [Related Endpoints](https://docs.zernio.com/platforms/instagram#related-endpoints)

Ask AI about Zernio API... `⌘J`