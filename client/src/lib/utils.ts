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
