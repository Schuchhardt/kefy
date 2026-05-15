'use client';

import { useState } from 'react';
import Image from 'next/image';

interface BlogCoverImageProps {
  src: string;
  alt: string;
}

export default function BlogCoverImage({ src, alt }: BlogCoverImageProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="blog-post-cover blog-cover-fallback">
        <Image src="/apple-touch-icon.png" alt="Kefy" width={64} height={64} />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={960}
      height={420}
      className="blog-post-cover"
      onError={() => setError(true)}
    />
  );
}
