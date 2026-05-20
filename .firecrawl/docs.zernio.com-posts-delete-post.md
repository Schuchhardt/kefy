[Overview](https://docs.zernio.com/) [Platforms](https://docs.zernio.com/platforms) [API Reference](https://docs.zernio.com/profiles/list-profiles) [Resources](https://docs.zernio.com/resources/integrations)

posts

# Delete post

Delete a draft or scheduled post from Zernio. Published posts cannot be deleted; use the Unpublish endpoint instead. Upload quota is automatically refunded.

Copy for AIOpen

* * *

https://zernio.com/api

DELETE

``/`v1`/`posts`/`{postId}`

Send

Authorization

Path

## [Authorization](https://docs.zernio.com/posts/delete-post\#authorization)

bearerAuth

AuthorizationBearer <token>

API key authentication - use your Zernio API key as a Bearer token

In: `header`

## [Path Parameters](https://docs.zernio.com/posts/delete-post\#path-parameters)

postIdstring

## [Response Body](https://docs.zernio.com/posts/delete-post\#response-body)

### 200  application/json

### 400

### 401  application/json

### 403

### 404  application/json

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

const { data } = await zernio.posts.deletePost({
  path: {
    postId: 'post_abc123',
  },
});
console.log(data);
```

200400401403404

```
{
  "message": "Post deleted successfully"
}
```

Empty

```
{
  "error": "Unauthorized"
}
```

Empty

```
{
  "error": "Not found"
}
```

[Update post PUT\\
\\
Update an existing post. Only draft, scheduled, failed, and partial posts can be edited.\\
Published, publishing, and cancelled posts cannot be modified.](https://docs.zernio.com/posts/update-post) [Unpublish post POST\\
\\
Deletes a published post from the specified platform. The post record in Zernio is kept but its status is updated to cancelled.\\
Not supported on Instagram, TikTok, or Snapchat. Threaded posts delete all items. YouTube deletion is permanent.](https://docs.zernio.com/posts/unpublish-post)

Ask AI about Zernio API... `⌘J`