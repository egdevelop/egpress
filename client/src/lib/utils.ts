import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getGitHubImageUrl(
  imagePath: string | undefined | null,
  repoFullName: string | undefined | null,
  branch: string = "main"
): string | null {
  if (!imagePath || !repoFullName) return null;
  
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  
  let cleanPath = imagePath;
  if (imagePath.startsWith("/image/")) {
    cleanPath = `public${imagePath}`;
  } else if (imagePath.startsWith("/")) {
    cleanPath = `public${imagePath}`;
  } else if (!imagePath.startsWith("public/")) {
    cleanPath = `public/image/${imagePath}`;
  }
  
  return `https://raw.githubusercontent.com/${repoFullName}/${branch}/${cleanPath}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export type ImageSeoStatus = 'good' | 'warning' | 'critical';

export function getImageSeoStatus(sizeInBytes: number): ImageSeoStatus {
  if (sizeInBytes <= 100 * 1024) return 'good';
  if (sizeInBytes <= 300 * 1024) return 'warning';
  return 'critical';
}

export function getImageSeoColor(status: ImageSeoStatus): string {
  switch (status) {
    case 'good':
      return 'text-green-600 dark:text-green-400';
    case 'warning':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'critical':
      return 'text-red-600 dark:text-red-400';
  }
}

export function getImageSeoBgColor(status: ImageSeoStatus): string {
  switch (status) {
    case 'good':
      return 'bg-green-500/10 border-green-500/30';
    case 'warning':
      return 'bg-yellow-500/10 border-yellow-500/30';
    case 'critical':
      return 'bg-red-500/10 border-red-500/30';
  }
}
