import { useState } from 'react';
import { apiAssetUrl } from '../lib/api';

export default function UserAvatar({ src, name, className = '', alt = `Foto de perfil de ${name}` }: {
  src?: string | null; name: string; className?: string; alt?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase() || '?';
  return <span className={`user-avatar ${className}`}>
    {src && failedSource !== src
      ? <img src={apiAssetUrl(src)} alt={alt} crossOrigin={src.startsWith('data:') ? undefined : 'use-credentials'} decoding="async" onError={() => setFailedSource(src)}/>
      : <span aria-label={`Iniciales de ${name}`}>{initials}</span>}
  </span>;
}
