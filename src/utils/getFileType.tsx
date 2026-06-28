import { FileText, Image as ImageIcon, Music, Play, Smartphone, Video } from 'lucide-react-native';
import { CategoryTint } from '../constants/Colors';

export function getFileType(mimeType: string, name: string): { icon: React.ReactNode; color: string; label: string } | undefined {
  const isApp =
    mimeType === 'application/vnd.android.package-archive' ||
    mimeType === 'application/x-msdownload' ||
    name.endsWith('.apk') || name.endsWith('.exe') || name.endsWith('.dmg');

  if (isApp) return { icon: <Smartphone size={24} color={CategoryTint.apps} strokeWidth={2} />, color: CategoryTint.apps, label: 'App' };
  if (mimeType.startsWith('image/')) return { icon: <ImageIcon size={24} color={CategoryTint.images} strokeWidth={2} />, color: CategoryTint.images, label: 'Image' };
  if (mimeType.startsWith('video/')) return { icon: <Play size={24} color={CategoryTint.videos} strokeWidth={2} />, color: CategoryTint.videos, label: 'Video' };
  if (mimeType.startsWith('audio/')) return { icon: <Music size={24} color={CategoryTint.audio} strokeWidth={2} />, color: CategoryTint.audio, label: 'Audio' };

  const isDoc =
    mimeType.includes('pdf') || mimeType.includes('document') ||
    mimeType.includes('text') || mimeType.includes('sheet');

  if (isDoc) return { icon: <FileText size={24} color={CategoryTint.docs} strokeWidth={2} />, color: CategoryTint.docs, label: 'Document' };

  return { icon: <FileText size={24} color={CategoryTint.other} strokeWidth={2} />, color: CategoryTint.other, label: 'File' };
}
