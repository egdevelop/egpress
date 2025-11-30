export interface OptimizedImage {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
}

export interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'image/jpeg' | 'image/webp' | 'image/png';
}

const DEFAULT_OPTIONS: OptimizeOptions = {
  maxWidth: 1200,
  maxHeight: 800,
  quality: 0.85,
  format: 'image/webp',
};

export async function optimizeImage(
  imageSource: string | Blob,
  options: OptimizeOptions = {}
): Promise<OptimizedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        let { width, height } = img;
        const maxWidth = opts.maxWidth!;
        const maxHeight = opts.maxHeight!;
        
        if (width > maxWidth || height > maxHeight) {
          const widthRatio = maxWidth / width;
          const heightRatio = maxHeight / height;
          const ratio = Math.min(widthRatio, heightRatio);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not create blob'));
              return;
            }
            
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              
              let originalSize = 0;
              if (typeof imageSource === 'string') {
                const base64 = imageSource.split(',')[1] || imageSource;
                originalSize = Math.round((base64.length * 3) / 4);
              } else {
                originalSize = imageSource.size;
              }
              
              resolve({
                dataUrl,
                blob,
                width,
                height,
                originalSize,
                optimizedSize: blob.size,
                compressionRatio: originalSize > 0 ? Math.round((1 - blob.size / originalSize) * 100) : 0,
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          opts.format,
          opts.quality
        );
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    
    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageSource);
    }
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function base64ToOptimizedBase64(
  base64Data: string,
  mimeType: string = 'image/png',
  options: OptimizeOptions = {}
): Promise<{ base64: string; mimeType: string; stats: { originalSize: number; optimizedSize: number; compressionRatio: number } }> {
  const dataUrl = base64Data.startsWith('data:') 
    ? base64Data 
    : `data:${mimeType};base64,${base64Data}`;
  
  const optimized = await optimizeImage(dataUrl, {
    format: 'image/webp',
    quality: 0.85,
    maxWidth: 1200,
    maxHeight: 800,
    ...options,
  });
  
  const base64 = optimized.dataUrl.split(',')[1];
  
  return {
    base64,
    mimeType: 'image/webp',
    stats: {
      originalSize: optimized.originalSize,
      optimizedSize: optimized.optimizedSize,
      compressionRatio: optimized.compressionRatio,
    },
  };
}
