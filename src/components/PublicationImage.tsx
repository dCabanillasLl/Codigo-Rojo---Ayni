import { useState, type ReactNode } from 'react';
import { apiAssetUrl } from '../lib/api';

export default function PublicationImage({ src, alt, className, fallback }: { src?: string | null; alt: string; className?: string; fallback: ReactNode }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return src && failedSource !== src ? <img src={apiAssetUrl(src)} alt={alt} className={className} loading="lazy" decoding="async" crossOrigin="use-credentials" onError={() => setFailedSource(src)}/> : <>{fallback}</>;
}
