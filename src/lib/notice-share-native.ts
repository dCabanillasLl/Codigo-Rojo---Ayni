import { Directory, Filesystem } from '@capacitor/filesystem';
import { registerPlugin } from '@capacitor/core';

const WhatsAppShare = registerPlugin<{ share(options: { text: string; fileUri: string }): Promise<{ opened: boolean }> }>('WhatsAppShare');

export function shareNativeNoticeTogether(text: string, fileUri: string): Promise<{ opened: boolean }> {
  return WhatsAppShare.share({ text, fileUri });
}

export async function prepareNativeNoticeFile(file: File): Promise<string> {
  // Keep recent files available after the chooser closes: WhatsApp may read them later.
  const folder = 'ayni-share';
  const previous = await Filesystem.readdir({ path: folder, directory: Directory.Cache }).catch(() => null);
  for (const entry of previous?.files || []) {
    if (entry.name.startsWith('flyer-') && entry.type === 'file' && entry.mtime < Date.now() - 86400000) {
      await Filesystem.deleteFile({ path: `${folder}/${entry.name}`, directory: Directory.Cache }).catch(() => undefined);
    }
  }
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('No pudimos preparar la imagen para compartir.'));
    reader.readAsDataURL(file);
  });
  const saved = await Filesystem.writeFile({ path: `${folder}/flyer-${Date.now()}-${file.name}`, directory: Directory.Cache, data: base64, recursive: true })
    .catch(() => { throw new Error('No pudimos preparar el flyer en este dispositivo. Puedes compartir solo el mensaje.'); });
  return saved.uri;
}
