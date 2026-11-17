import { useState } from 'react';
import { apiAssetUrl } from '../lib/api';
import { initials } from './UI';

export default function ProfileAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = photoUrl ? apiAssetUrl(photoUrl) : null;
  return <span className="small-avatar">
    {src && src !== failedUrl
      ? <img key={src} src={src} crossOrigin="use-credentials" alt="" onError={() => setFailedUrl(src)}/>
      : initials(name)}
  </span>;
}
