import { useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  value: string;
  onChange: (path: string) => void;
  label?: string;
  description?: string;
  accept?: string;
  className?: string;
}

export function ImageUpload({
  value,
  onChange,
  label,
  description,
  accept = "image/*",
  className,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Image must be less than 5MB.",
        variant: "destructive",
      });
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Upload failed");
      }

      onChange(result.path);
      setPreviewUrl(null);

      toast({
        title: "Image uploaded",
        description: "Your image has been uploaded successfully.",
      });
    } catch (error: any) {
      setPreviewUrl(null);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  }, [onChange, toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [handleUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleClear = useCallback(() => {
    onChange("");
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [onChange]);

  const handleClick = useCallback(() => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  }, [isUploading]);

  const displayImage = previewUrl || value;

  return (
    <div className={cn("space-y-2", className)} data-testid="image-upload">
      {label && (
        <label className="text-sm font-medium leading-none" data-testid="image-upload-label">
          {label}
        </label>
      )}
      
      <Card
        className={cn(
          "relative overflow-hidden cursor-pointer transition-colors",
          isDragOver && "ring-2 ring-primary ring-offset-2",
          isUploading && "pointer-events-none opacity-70"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        data-testid="image-upload-dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
          data-testid="input-file-upload"
        />

        {displayImage ? (
          <div className="relative aspect-video">
            <img
              src={displayImage}
              alt="Preview"
              className="w-full h-full object-cover"
              data-testid="img-preview"
            />
            
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            
            {!isUploading && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                data-testid="button-clear-image"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center aspect-video">
            {isUploading ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground" data-testid="text-uploading">
                  Uploading...
                </p>
              </>
            ) : (
              <>
                <div className="rounded-full bg-muted p-3 mb-3">
                  {isDragOver ? (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <p className="text-sm font-medium" data-testid="text-upload-prompt">
                  {isDragOver ? "Drop image here" : "Click or drag to upload"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, GIF, WebP up to 5MB
                </p>
              </>
            )}
          </div>
        )}
      </Card>

      {description && (
        <p className="text-sm text-muted-foreground" data-testid="image-upload-description">
          {description}
        </p>
      )}
    </div>
  );
}
