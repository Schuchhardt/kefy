[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_5zStfeAzCUJ8Ua8LRpYh377eZZPs)](https://docs.zernio.com/)

[![Zernio](https://docs.zernio.com/docs-static/zernio-logo.svg?dpl=dpl_5zStfeAzCUJ8Ua8LRpYh377eZZPs)](https://docs.zernio.com/)

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

FacebookQuick Reference

# Facebook

Schedule and automate Facebook Page posts with Zernio API - Feed posts, Stories, multi-image, multi-link carousels, GIFs, and first comments

Copy for AIOpen

* * *

## [Quick Reference](https://docs.zernio.com/platforms/facebook\#quick-reference)

| Property | Value |
| --- | --- |
| Character limit | 63,206 (truncated at ~480 with "See more") |
| Images per post | 10 |
| Videos per post | 1 |
| Image formats | JPEG, PNG, GIF (WebP auto-converted to JPEG) |
| Image max size | 4 MB (Facebook rejects larger in practice) |
| Video formats | MP4, MOV |
| Video max size | 4 GB |
| Video max duration | 240 min (feed), 120 sec (stories) |
| Post types | Feed (text/image/video/multi-image/multi-link carousel), Story, Reel |
| Scheduling | Yes |
| Inbox (DMs) | Yes |
| Inbox (Comments) | Yes |
| Inbox (Reviews) | Yes |
| Comment-to-DM automations | Yes |
| Analytics | Yes |

## [Before You Start](https://docs.zernio.com/platforms/facebook\#before-you-start)

Facebook API only posts to Pages, not personal profiles. You must have a Facebook Page and admin access to it. Also: Facebook often rejects photos larger than 4 MB even though the stated limit is higher. Keep images under 4 MB and use JPEG or PNG format. WebP images are auto-converted to JPEG by Zernio.

- API posts to **Pages only** (not personal profiles)
- User must be Page **Admin** or **Editor**
- Facebook tokens expire frequently -- subscribe to the `account.disconnected` webhook
- Multiple Pages can be managed from one connected account

## [OAuth Scopes](https://docs.zernio.com/platforms/facebook\#oauth-scopes)

When a Facebook Page is connected, Zernio requests these scopes:

| Scope | What it enables |
| --- | --- |
| `pages_show_list` | List the Pages you manage during connection |
| `pages_manage_posts` | Create, edit and delete Page posts |
| `pages_read_engagement` | Read Page content and engagement (also used for analytics) |
| `read_insights` | Page and post analytics (views, clicks, reach) |
| `pages_manage_engagement` | Manage comments on Page posts |
| `pages_read_user_content` | Read user-generated content (comments) on the Page |
| `pages_messaging` | Messenger conversations in the inbox |
| `pages_manage_metadata` | Page webhook subscriptions and settings |
| `business_management` | Discover Pages owned through a Meta Business Manager |

If your workspace has the [Ads add-on](https://docs.zernio.com/platforms/meta-ads), the connect flow also requests `ads_management`, `ads_read`, `pages_manage_ads` and `leads_retrieval` so the same token can manage ads and lead forms. Accounts connected before the add-on was enabled need a reconnect to pick these up.

Zernio requests all scopes in a single OAuth flow when the account is connected (see [Connecting Accounts](https://docs.zernio.com/guides/connecting-accounts)); scopes cannot be requested individually. To check what a connected account can currently do, call [Account Health](https://docs.zernio.com/accounts/get-all-accounts-health): it reports posting and analytics capability derived from the scopes the user actually granted.

## [Quick Start](https://docs.zernio.com/platforms/facebook\#quick-start)

Post to a Facebook Page in under 60 seconds:

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Hello from Zernio API!',
  platforms: [\
    { platform: 'facebook', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true
});
console.log('Posted to Facebook!', post._id);
```

```
result = client.posts.create_post(
    content="Hello from Zernio API!",
    platforms=[\
        {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True
)
post = result.post
print(f"Posted to Facebook! {post['_id']}")
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello from Zernio API!",
    "platforms": [\
      {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true
  }'
```

## [Content Types](https://docs.zernio.com/platforms/facebook\#content-types)

## [Draft Posts (Publishing Tools)](https://docs.zernio.com/platforms/facebook\#draft-posts-publishing-tools)

Create an unpublished Facebook draft that appears in **Facebook Publishing Tools** instead of publishing immediately. This is useful for review/approval workflows.

> **Note:** Drafts are supported for feed posts (text, link, image, video) and reels. Drafts are not supported for stories. `firstComment` is skipped when `draft: true`.

curlJavaScriptPython

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Draft post for review before publishing",
    "platforms": [{\
      "platform": "facebook",\
      "accountId": "YOUR_ACCOUNT_ID"\
    }],
    "publishNow": true,
    "facebookSettings": {
      "draft": true
    }
  }'
```

```
const { post } = await zernio.posts.createPost({
  content: 'Draft post for review before publishing',
  platforms: [{ platform: 'facebook', accountId: 'YOUR_ACCOUNT_ID' }],
  publishNow: true,
  facebookSettings: {
    draft: true
  }
});

console.log('Draft created!', post._id);
```

```
result = client.posts.create_post(
    content="Draft post for review before publishing",
    platforms=[{"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}],
    publish_now=True,
    facebook_settings={"draft": True}
)

post = result.post
print(f"Draft created! {post['_id']}")
```

### [Text-Only Post](https://docs.zernio.com/platforms/facebook\#text-only-post)

No media required. Facebook is one of the few platforms that supports text-only posts.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Just a text update for our followers.',
  platforms: [\
    { platform: 'facebook', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true
});
```

```
result = client.posts.create_post(
    content="Just a text update for our followers.",
    platforms=[\
        {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True
)
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Just a text update for our followers.",
    "platforms": [\
      {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true
  }'
```

### [Single Image Post](https://docs.zernio.com/platforms/facebook\#single-image-post)

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Check out this photo!',
  mediaItems: [\
    { type: 'image', url: 'https://example.com/photo.jpg' }\
  ],
  platforms: [\
    { platform: 'facebook', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true
});
```

```
result = client.posts.create_post(
    content="Check out this photo!",
    media_items=[\
        {"type": "image", "url": "https://example.com/photo.jpg"}\
    ],
    platforms=[\
        {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True
)
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Check out this photo!",
    "mediaItems": [\
      {"type": "image", "url": "https://example.com/photo.jpg"}\
    ],
    "platforms": [\
      {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true
  }'
```

### [Multi-Image Post](https://docs.zernio.com/platforms/facebook\#multi-image-post)

Facebook supports up to **10 images** in a single post. You cannot mix images and videos in the same post.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Photo dump from the weekend!',
  mediaItems: [\
    { type: 'image', url: 'https://example.com/photo1.jpg' },\
    { type: 'image', url: 'https://example.com/photo2.jpg' },\
    { type: 'image', url: 'https://example.com/photo3.jpg' }\
  ],
  platforms: [\
    { platform: 'facebook', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true
});
```

```
result = client.posts.create_post(
    content="Photo dump from the weekend!",
    media_items=[\
        {"type": "image", "url": "https://example.com/photo1.jpg"},\
        {"type": "image", "url": "https://example.com/photo2.jpg"},\
        {"type": "image", "url": "https://example.com/photo3.jpg"}\
    ],
    platforms=[\
        {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True
)
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Photo dump from the weekend!",
    "mediaItems": [\
      {"type": "image", "url": "https://example.com/photo1.jpg"},\
      {"type": "image", "url": "https://example.com/photo2.jpg"},\
      {"type": "image", "url": "https://example.com/photo3.jpg"}\
    ],
    "platforms": [\
      {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true
  }'
```

### [Multi-Link Carousel Post](https://docs.zernio.com/platforms/facebook\#multi-link-carousel-post)

Render a post as a 2-5 card carousel where each image has its own click-through link and headline. Useful for product catalogs, listings, or any post where each photo points to a different URL.

Set `facebookSettings.carouselCards` to layer per-card metadata on top of your existing `mediaItems` (one card per image, in order). All items must be images -- video cards aren't supported by Facebook. Optionally set `facebookSettings.carouselLink` to control the "See more" destination shown on the carousel end card.

> **Display truncation:** Facebook renders card titles around 35 characters and descriptions around 30 characters. Longer strings are accepted (up to 255 chars each in the API) but get truncated on render.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Check out our latest inventory',
  mediaItems: [\
    { type: 'image', url: 'https://example.com/car-1.jpg' },\
    { type: 'image', url: 'https://example.com/car-2.jpg' },\
    { type: 'image', url: 'https://example.com/car-3.jpg' }\
  ],
  platforms: [\
    { platform: 'facebook', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true,
  facebookSettings: {
    carouselLink: 'https://example.com/inventory',
    carouselCards: [\
      { link: 'https://example.com/inventory/car-1', name: '2024 Sedan', description: 'Low miles' },\
      { link: 'https://example.com/inventory/car-2', name: '2023 SUV', description: 'Certified pre-owned' },\
      { link: 'https://example.com/inventory/car-3', name: '2024 Truck', description: 'Loaded' }\
    ]
  }
});
```

```
result = client.posts.create_post(
    content="Check out our latest inventory",
    media_items=[\
        {"type": "image", "url": "https://example.com/car-1.jpg"},\
        {"type": "image", "url": "https://example.com/car-2.jpg"},\
        {"type": "image", "url": "https://example.com/car-3.jpg"}\
    ],
    platforms=[\
        {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True,
    facebook_settings={
        "carouselLink": "https://example.com/inventory",
        "carouselCards": [\
            {"link": "https://example.com/inventory/car-1", "name": "2024 Sedan", "description": "Low miles"},\
            {"link": "https://example.com/inventory/car-2", "name": "2023 SUV", "description": "Certified pre-owned"},\
            {"link": "https://example.com/inventory/car-3", "name": "2024 Truck", "description": "Loaded"}\
        ]
    }
)
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Check out our latest inventory",
    "mediaItems": [\
      {"type": "image", "url": "https://example.com/car-1.jpg"},\
      {"type": "image", "url": "https://example.com/car-2.jpg"},\
      {"type": "image", "url": "https://example.com/car-3.jpg"}\
    ],
    "platforms": [\
      {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true,
    "facebookSettings": {
      "carouselLink": "https://example.com/inventory",
      "carouselCards": [\
        {"link": "https://example.com/inventory/car-1", "name": "2024 Sedan", "description": "Low miles"},\
        {"link": "https://example.com/inventory/car-2", "name": "2023 SUV", "description": "Certified pre-owned"},\
        {"link": "https://example.com/inventory/car-3", "name": "2024 Truck", "description": "Loaded"}\
      ]
    }
  }'
```

### [Video Post](https://docs.zernio.com/platforms/facebook\#video-post)

A single video per post. For GIFs, use `type: 'video'` \-\- they are treated as videos internally, auto-play, and loop.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Watch our latest video!',
  mediaItems: [\
    { type: 'video', url: 'https://example.com/video.mp4' }\
  ],
  platforms: [\
    { platform: 'facebook', accountId: 'YOUR_ACCOUNT_ID' }\
  ],
  publishNow: true
});
```

```
result = client.posts.create_post(
    content="Watch our latest video!",
    media_items=[\
        {"type": "video", "url": "https://example.com/video.mp4"}\
    ],
    platforms=[\
        {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    publish_now=True
)
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Watch our latest video!",
    "mediaItems": [\
      {"type": "video", "url": "https://example.com/video.mp4"}\
    ],
    "platforms": [\
      {"platform": "facebook", "accountId": "YOUR_ACCOUNT_ID"}\
    ],
    "publishNow": true
  }'
```

### [Story (Image or Video)](https://docs.zernio.com/platforms/facebook\#story-image-or-video)

Stories are 24-hour ephemeral content. Media is required. Text captions are **not** displayed on Stories, and interactive stickers are not supported via the API.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  mediaItems: [\
    { type: 'image', url: 'https://example.com/story.jpg' }\
  ],
  platforms: [{\
    platform: 'facebook',\
    accountId: 'YOUR_ACCOUNT_ID',\
    platformSpecificData: {\
      contentType: 'story'\
    }\
  }],
  publishNow: true
});
```

```
result = client.posts.create_post(
    media_items=[\
        {"type": "image", "url": "https://example.com/story.jpg"}\
    ],
    platforms=[{\
        "platform": "facebook",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
            "contentType": "story"\
        }\
    }],
    publish_now=True
)
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mediaItems": [\
      {"type": "image", "url": "https://example.com/story.jpg"}\
    ],
    "platforms": [{\
      "platform": "facebook",\
      "accountId": "YOUR_ACCOUNT_ID",\
      "platformSpecificData": {\
        "contentType": "story"\
      }\
    }],
    "publishNow": true
  }'
```

### [Reel (Video)](https://docs.zernio.com/platforms/facebook\#reel-video)

Publish a Facebook Reel (short vertical video). Reels require a **single vertical video**.

> **Note:**`content` is used as the Reel caption. Use `platformSpecificData.title` to set a separate Reel title.

curlJavaScriptPython

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Behind the scenes 🎬",
    "mediaItems": [\
      {"type": "video", "url": "https://example.com/reel.mp4"}\
    ],
    "platforms": [{\
      "platform": "facebook",\
      "accountId": "YOUR_ACCOUNT_ID",\
      "platformSpecificData": {\
        "contentType": "reel",\
        "title": "Studio day"\
      }\
    }],
    "publishNow": true
  }'
```

```
const { post } = await zernio.posts.createPost({
  content: 'Behind the scenes 🎬',
  mediaItems: [\
    { type: 'video', url: 'https://example.com/reel.mp4' }\
  ],
  platforms: [{\
    platform: 'facebook',\
    accountId: 'YOUR_ACCOUNT_ID',\
    platformSpecificData: {\
      contentType: 'reel',\
      title: 'Studio day'\
    }\
  }],
  publishNow: true
});
console.log('Posted Reel to Facebook!', post._id);
```

```
result = client.posts.create_post(
    content="Behind the scenes 🎬",
    media_items=[\
        {"type": "video", "url": "https://example.com/reel.mp4"}\
    ],
    platforms=[{\
        "platform": "facebook",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
            "contentType": "reel",\
            "title": "Studio day"\
        }\
    }],
    publish_now=True
)
post = result.post
print(f"Posted Reel to Facebook! {post['_id']}")
```

**Reel requirements**

- Single video only (no images)
- Vertical video recommended (9:16)
- Duration: 3–60 seconds

### [First Comment](https://docs.zernio.com/platforms/facebook\#first-comment)

Auto-post a first comment immediately after your post is published. Does **not** work with Stories.

> **Note:**`firstComment` is skipped when `draft: true`.

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'New product launch!',
  mediaItems: [\
    { type: 'image', url: 'https://example.com/product.jpg' }\
  ],
  platforms: [{\
    platform: 'facebook',\
    accountId: 'YOUR_ACCOUNT_ID',\
    platformSpecificData: {\
      firstComment: 'Link to purchase: https://shop.example.com'\
    }\
  }],
  publishNow: true
});
```

```
result = client.posts.create_post(
    content="New product launch!",
    media_items=[\
        {"type": "image", "url": "https://example.com/product.jpg"}\
    ],
    platforms=[{\
        "platform": "facebook",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
            "firstComment": "Link to purchase: https://shop.example.com"\
        }\
    }],
    publish_now=True
)
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "New product launch!",
    "mediaItems": [\
      {"type": "image", "url": "https://example.com/product.jpg"}\
    ],
    "platforms": [{\
      "platform": "facebook",\
      "accountId": "YOUR_ACCOUNT_ID",\
      "platformSpecificData": {\
        "firstComment": "Link to purchase: https://shop.example.com"\
      }\
    }],
    "publishNow": true
  }'
```

### [Geo-Restriction](https://docs.zernio.com/platforms/facebook\#geo-restriction)

Restrict who can see your Facebook post by country. This is a hard visibility restriction: users outside the specified countries cannot see the post at all. Supported for feed posts, videos, and reels. Not supported for stories.

curlJavaScriptPython

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This post is only visible in the US and Spain",
    "platforms": [{\
      "platform": "facebook",\
      "accountId": "YOUR_ACCOUNT_ID",\
      "platformSpecificData": {\
        "geoRestriction": {\
          "countries": ["US", "ES"]\
        }\
      }\
    }],
    "publishNow": true
  }'
```

```
const { post } = await zernio.posts.createPost({
  content: 'This post is only visible in the US and Spain',
  platforms: [{\
    platform: 'facebook',\
    accountId: 'YOUR_ACCOUNT_ID',\
    platformSpecificData: {\
      geoRestriction: {\
        countries: ['US', 'ES']\
      }\
    }\
  }],
  publishNow: true
});
```

```
result = client.posts.create_post(
    content="This post is only visible in the US and Spain",
    platforms=[{\
        "platform": "facebook",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
            "geoRestriction": {\
                "countries": ["US", "ES"]\
            }\
        }\
    }],
    publish_now=True
)
```

`geoRestriction.countries` accepts up to 25 uppercase ISO 3166-1 alpha-2 country codes (e.g. `"US"`, `"GB"`, `"DE"`).

## [Media Requirements](https://docs.zernio.com/platforms/facebook\#media-requirements)

### [Images](https://docs.zernio.com/platforms/facebook\#images)

| Property | Feed Post | Story |
| --- | --- | --- |
| **Max images** | 10 | 1 |
| **Formats** | JPEG, PNG, GIF (WebP auto-converted) | JPEG, PNG |
| **Max file size** | 4 MB | 4 MB |
| **Recommended** | 1200 x 630 px | 1080 x 1920 px |

### [Videos](https://docs.zernio.com/platforms/facebook\#videos)

| Property | Feed Video | Story |
| --- | --- | --- |
| **Max videos** | 1 | 1 |
| **Formats** | MP4, MOV | MP4, MOV |
| **Max file size** | 4 GB | 4 GB |
| **Max duration** | 240 minutes | 120 seconds |
| **Min duration** | 1 second | 1 second |
| **Recommended resolution** | 1280 x 720 px min | 1080 x 1920 px |
| **Frame rate** | 30 fps recommended | 30 fps |
| **Codec** | H.264 | H.264 |

## [Platform-Specific Fields](https://docs.zernio.com/platforms/facebook\#platform-specific-fields)

All fields below go inside `platformSpecificData` for the Facebook platform entry.

| Field | Type | Description |
| --- | --- | --- |
| `draft` | boolean | When true, creates an unpublished draft in Facebook Publishing Tools instead of publishing immediately. Not supported for Stories. |
| `contentType` | `"story"` \| `"reel"` | Set to `"story"` for Page Stories (24h ephemeral) or `"reel"` for Reels (short vertical video). Defaults to feed post if omitted. |
| `title` | string | Reel title (only for `contentType="reel"`). Separate from the `content` caption. |
| `firstComment` | string | Auto-posted as the first comment after publish. Feed posts and Reels (not Stories). Skipped when `draft` is true. |
| `pageId` | string | Post to a specific Page when the connected account manages multiple Pages. Get available pages with `GET /v1/accounts/{accountId}/facebook-page`. |
| `carouselCards` | array | Multi-link carousel cards (2–5). Requires `mediaItems` with the same length (images only). Mutually exclusive with `contentType="story"` or `"reel"`. |
| `carouselLink` | string | Optional top-level “See more” link for the carousel end card. Only used with `carouselCards`. |
| `geoRestriction` | object | Restrict post visibility to specific countries. See [Geo-Restriction](https://docs.zernio.com/platforms/facebook#geo-restriction) below. |

## [Multi-Page Posting](https://docs.zernio.com/platforms/facebook\#multi-page-posting)

If your connected Facebook account manages multiple Pages, you can list them, set a default, or override per post.

### [List Available Pages](https://docs.zernio.com/platforms/facebook\#list-available-pages)

Node.jsPythoncurl

```
const pages = await zernio.connect.getFacebookPages('YOUR_ACCOUNT_ID');
console.log('Available pages:', pages);
```

```
pages = client.connect.get_facebook_pages("YOUR_ACCOUNT_ID")
print("Available pages:", pages)
```

```
curl -X GET https://zernio.com/api/v1/accounts/YOUR_ACCOUNT_ID/facebook-page \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### [Post to Multiple Pages](https://docs.zernio.com/platforms/facebook\#post-to-multiple-pages)

Use the same `accountId` multiple times with different `pageId` values:

Node.jsPythoncurl

```
const { post } = await zernio.posts.createPost({
  content: 'Exciting news from all our brands!',
  platforms: [\
    {\
      platform: 'facebook',\
      accountId: 'YOUR_ACCOUNT_ID',\
      platformSpecificData: { pageId: '111111111' }\
    },\
    {\
      platform: 'facebook',\
      accountId: 'YOUR_ACCOUNT_ID',\
      platformSpecificData: { pageId: '222222222' }\
    }\
  ],
  publishNow: true
});
console.log('Posted to Facebook!', post._id);
```

```
result = client.posts.create_post(
    content="Exciting news from all our brands!",
    platforms=[\
        {\
            "platform": "facebook",\
            "accountId": "YOUR_ACCOUNT_ID",\
            "platformSpecificData": {"pageId": "111111111"}\
        },\
        {\
            "platform": "facebook",\
            "accountId": "YOUR_ACCOUNT_ID",\
            "platformSpecificData": {"pageId": "222222222"}\
        }\
    ],
    publish_now=True
)
post = result.post
print(f"Posted to Facebook! {post['_id']}")
```

```
curl -X POST https://zernio.com/api/v1/posts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Exciting news from all our brands!",
    "platforms": [\
      {\
        "platform": "facebook",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
          "pageId": "111111111"\
        }\
      },\
      {\
        "platform": "facebook",\
        "accountId": "YOUR_ACCOUNT_ID",\
        "platformSpecificData": {\
          "pageId": "222222222"\
        }\
      }\
    ],
    "publishNow": true
  }'
```

You can also set a default page with `POST /v1/accounts/{accountId}/facebook-page` so you don't need to pass `pageId` on every request.

## [Media URL Requirements](https://docs.zernio.com/platforms/facebook\#media-url-requirements)

- URLs must be **publicly accessible** via HTTPS
- No redirects, no authentication
- Cloud storage sharing links (Google Drive, Dropbox) may not work -- use direct download URLs
- WebP images are auto-converted to JPEG before upload

## [Analytics](https://docs.zernio.com/platforms/facebook\#analytics)

> **Included** — Analytics is bundled with every paid account on the [Usage plan](https://docs.zernio.com/pricing).

Available metrics via the [Analytics API](https://docs.zernio.com/analytics/get-analytics):

| Metric | Available |
| --- | --- |
| Impressions | ✅ |
| Likes | ✅ |
| Comments | ✅ |
| Shares | ✅ |
| Clicks | ✅ |
| Views | ✅ |

Facebook also provides a dedicated [Page Insights API](https://docs.zernio.com/analytics/get-facebook-page-insights) for page-level aggregates (media views, post engagements, video metrics, follower count). Uses current (post-November 2025) Meta metric names; the legacy page\_impressions / page\_fans / page\_fan\_adds / page\_fan\_removes metrics were deprecated by Meta and are rejected by this endpoint. followers\_gained and followers\_lost are synthesized from Zernio's daily follower snapshotter.

Node.jsPythoncurl

```
const analytics = await zernio.analytics.getAnalytics({
  platform: 'facebook',
  fromDate: '2024-01-01',
  toDate: '2024-01-31'
});
console.log(analytics.posts);
```

```
analytics = client.analytics.get_analytics(
    platform="facebook",
    from_date="2024-01-01",
    to_date="2024-01-31"
)
print(analytics["posts"])
```

```
curl "https://zernio.com/api/v1/analytics?platform=facebook&fromDate=2024-01-01&toDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## [What You Can't Do](https://docs.zernio.com/platforms/facebook\#what-you-cant-do)

- Post to **personal profiles** (Pages only)
- Create Events
- Post to Groups (deprecated by Facebook)
- Go Live (requires the separate Facebook Live API)
- Add interactive story stickers
- Target audiences by demographics (age, gender, interests) for organic posts (country-level geo-restriction IS supported, see [Geo-Restriction](https://docs.zernio.com/platforms/facebook#geo-restriction))

## [Common Errors](https://docs.zernio.com/platforms/facebook\#common-errors)

| Error | Meaning | Fix |
| --- | --- | --- |
| "Photos should be smaller than 4MB and saved as JPG or PNG." | Image exceeds actual size limit or unsupported format | Reduce to under 4 MB. Use JPEG or PNG. |
| "Missing or invalid image file" | Facebook couldn't process image -- corrupt, wrong format, or inaccessible URL | Verify URL in an incognito browser. Ensure JPEG/PNG under 4 MB. |
| "Unable to fetch video file from URL." | Facebook's servers couldn't download the video | Use a direct, publicly accessible URL. Avoid cloud storage sharing links. |
| "Facebook tokens expired. Please reconnect." | OAuth token expired | Reconnect the account. Facebook tokens have shorter lifespans. Subscribe to the `account.disconnected` webhook. |
| "Confirm your identity before you can publish as this Page." | Facebook security check triggered | Log into Facebook, go to the Page, and complete identity verification. |
| "Publishing failed due to max retries reached" | All 3 retry attempts failed | Usually temporary. Retry manually or wait and try again. |

## [Inbox](https://docs.zernio.com/platforms/facebook\#inbox)

> **Included** — Inbox (DMs, comments, reviews) is bundled with every paid account on the [Usage plan](https://docs.zernio.com/pricing).

Facebook has the most complete inbox support across DMs, comments, and reviews.

### [Direct Messages](https://docs.zernio.com/platforms/facebook\#direct-messages)

| Feature | Supported |
| --- | --- |
| List conversations | ✅ |
| Fetch messages | ✅ |
| Send text messages | ✅ |
| Send attachments | ✅ (images, videos, audio, files) |
| Quick replies | ✅ (up to 13, Meta quick\_replies) |
| Buttons | ✅ (up to 3, generic template) |
| Carousels | ✅ (generic template, up to 10 elements) |
| Message tags | ✅ (4 types) |
| Archive/unarchive | ✅ |

**Message tags:** Use `messagingType: "MESSAGE_TAG"` with one of: `CONFIRMED_EVENT_UPDATE`, `POST_PURCHASE_UPDATE`, `ACCOUNT_UPDATE`, or `HUMAN_AGENT` to send messages outside the 24-hour messaging window.

### [Webhooks](https://docs.zernio.com/platforms/facebook\#webhooks)

Messenger emits the full set of message lifecycle webhooks:

| Event | When it fires |
| --- | --- |
| `message.received` | New incoming DM |
| `message.sent` | Outgoing DM is sent |
| `message.edited` | The sender edits a previously-sent message (up to 5 edits per Meta) |
| `message.delivered` | An outgoing DM is delivered to the recipient |
| `message.read` | The recipient reads an outgoing DM |

Messages are stored locally via webhooks. See the [Webhooks](https://docs.zernio.com/webhooks) page for payload details.

**Note:** Messenger does not expose incoming-message unsend via webhook, so `message.deleted` is not emitted for Facebook. This is a platform limitation.

### [Persistent Menu](https://docs.zernio.com/platforms/facebook\#persistent-menu)

Manage the persistent menu shown in Facebook Messenger conversations. Max 3 top-level items, max 5 nested items.

See [Account Settings](https://docs.zernio.com/account-settings/get-messenger-menu) for the `GET/PUT/DELETE /v1/accounts/{accountId}/messenger-menu` endpoints.

### [Comments](https://docs.zernio.com/platforms/facebook\#comments)

| Feature | Supported |
| --- | --- |
| List comments on posts | ✅ |
| Reply to comments | ✅ |
| Delete comments | ✅ |
| Like comments | ✅ |
| Hide/unhide comments | ✅ |
| Send private reply (DM after comment) | ✅ (text + up to 13 quick replies OR 1-3 inline buttons, 7-day window, one per comment) |

### [Reviews (Pages)](https://docs.zernio.com/platforms/facebook\#reviews-pages)

| Feature | Supported |
| --- | --- |
| List reviews | ✅ |
| Reply to reviews | ✅ |

## [Related Endpoints](https://docs.zernio.com/platforms/facebook\#related-endpoints)

- [Connect Facebook Account](https://docs.zernio.com/guides/connecting-accounts) \- OAuth flow
- [Create Post](https://docs.zernio.com/posts/create-post) \- Post creation and scheduling
- [Upload Media](https://docs.zernio.com/guides/media-uploads) \- Image and video uploads
- [Analytics](https://docs.zernio.com/analytics/get-analytics) \- Post performance metrics
- [Messages](https://docs.zernio.com/messages/list-inbox-conversations), [Comments](https://docs.zernio.com/comments/list-inbox-comments), and [Reviews](https://docs.zernio.com/reviews/list-inbox-reviews)
- [Account Settings](https://docs.zernio.com/account-settings/get-messenger-menu) \- Persistent menu configuration

[Instagram\\
\\
Schedule and automate Instagram posts with Zernio API - Feed, Stories, Reels, Carousels, collaborators, and user tags](https://docs.zernio.com/platforms/instagram) [LinkedIn\\
\\
Schedule and automate LinkedIn posts with Zernio API - Personal profiles, company pages, images, videos, documents, and multi-organization posting](https://docs.zernio.com/platforms/linkedin)

### On this page

[Quick Reference](https://docs.zernio.com/platforms/facebook#quick-reference) [Before You Start](https://docs.zernio.com/platforms/facebook#before-you-start) [OAuth Scopes](https://docs.zernio.com/platforms/facebook#oauth-scopes) [Quick Start](https://docs.zernio.com/platforms/facebook#quick-start) [Content Types](https://docs.zernio.com/platforms/facebook#content-types) [Draft Posts (Publishing Tools)](https://docs.zernio.com/platforms/facebook#draft-posts-publishing-tools) [Text-Only Post](https://docs.zernio.com/platforms/facebook#text-only-post) [Single Image Post](https://docs.zernio.com/platforms/facebook#single-image-post) [Multi-Image Post](https://docs.zernio.com/platforms/facebook#multi-image-post) [Multi-Link Carousel Post](https://docs.zernio.com/platforms/facebook#multi-link-carousel-post) [Video Post](https://docs.zernio.com/platforms/facebook#video-post) [Story (Image or Video)](https://docs.zernio.com/platforms/facebook#story-image-or-video) [Reel (Video)](https://docs.zernio.com/platforms/facebook#reel-video) [First Comment](https://docs.zernio.com/platforms/facebook#first-comment) [Geo-Restriction](https://docs.zernio.com/platforms/facebook#geo-restriction) [Media Requirements](https://docs.zernio.com/platforms/facebook#media-requirements) [Images](https://docs.zernio.com/platforms/facebook#images) [Videos](https://docs.zernio.com/platforms/facebook#videos) [Platform-Specific Fields](https://docs.zernio.com/platforms/facebook#platform-specific-fields) [Multi-Page Posting](https://docs.zernio.com/platforms/facebook#multi-page-posting) [List Available Pages](https://docs.zernio.com/platforms/facebook#list-available-pages) [Post to Multiple Pages](https://docs.zernio.com/platforms/facebook#post-to-multiple-pages) [Media URL Requirements](https://docs.zernio.com/platforms/facebook#media-url-requirements) [Analytics](https://docs.zernio.com/platforms/facebook#analytics) [What You Can't Do](https://docs.zernio.com/platforms/facebook#what-you-cant-do) [Common Errors](https://docs.zernio.com/platforms/facebook#common-errors) [Inbox](https://docs.zernio.com/platforms/facebook#inbox) [Direct Messages](https://docs.zernio.com/platforms/facebook#direct-messages) [Webhooks](https://docs.zernio.com/platforms/facebook#webhooks) [Persistent Menu](https://docs.zernio.com/platforms/facebook#persistent-menu) [Comments](https://docs.zernio.com/platforms/facebook#comments) [Reviews (Pages)](https://docs.zernio.com/platforms/facebook#reviews-pages) [Related Endpoints](https://docs.zernio.com/platforms/facebook#related-endpoints)

Ask AI about Zernio API... `⌘J`