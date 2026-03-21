import imageCompression from 'browser-image-compression';

/**
 * Compress an image file to maximum 500KB
 * @param file - The image file to compress
 * @param maxSizeKB - Maximum size in KB (default: 500)
 * @returns Promise<string> - Base64 data URL of compressed image
 */
export async function compressImage(file: File, maxSizeKB: number = 500): Promise<string> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image');
    }

    console.log(`📦 Original image size: ${(file.size / 1024).toFixed(2)} KB`);

    // Compression options
    const options = {
      maxSizeMB: maxSizeKB / 1024, // Convert KB to MB
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg' as const,
    };

    // Compress the image
    const compressedFile = await imageCompression(file, options);
    console.log(`✅ Compressed image size: ${(compressedFile.size / 1024).toFixed(2)} KB`);

    // Convert to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onloadend = () => {
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        reject(new Error('Failed to read compressed image'));
      };

      reader.readAsDataURL(compressedFile);
    });
  } catch (error) {
    console.error('Image compression error:', error);
    throw new Error('Failed to compress image. Please try a smaller file.');
  }
}

/**
 * Compress multiple images
 * @param files - Array of image files
 * @param maxSizeKB - Maximum size in KB (default: 500)
 * @returns Promise<string[]> - Array of base64 data URLs
 */
export async function compressMultipleImages(files: File[], maxSizeKB: number = 500): Promise<string[]> {
  return Promise.all(files.map(file => compressImage(file, maxSizeKB)));
}

/**
 * Alias for compressImage - for backward compatibility
 */
export const compressImageToDataURL = compressImage;

/**
 * Alias for compressMultipleImages with 500KB default - for backward compatibility
 */
export async function compressMultipleImagesToDataURL(files: File[], maxSizeKB: number = 500): Promise<string[]> {
  return compressMultipleImages(files, maxSizeKB);
}

/**
 * Alias for vendor admin - compress to 500KB
 */
export async function compressMultipleImagesToDataURLVendor(files: File[]): Promise<string[]> {
  return compressMultipleImages(files, 500);
}

/**
 * Alias for vendor admin - compress single image to 500KB (for backward compatibility)
 */
export async function compressImageToDataURLVendor(file: File): Promise<string> {
  return compressImage(file, 500);
}

/**
 * Convert base64 data URL to File object
 * @param dataUrl - Base64 data URL
 * @param filename - Desired filename
 * @returns File object
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Compress image and return as File object (for form uploads)
 * @param file - Original image file
 * @param maxSizeKB - Maximum size in KB (default: 500)
 * @returns Promise<File> - Compressed file
 */
export async function compressImageToFile(file: File, maxSizeKB: number = 500): Promise<File> {
  const dataUrl = await compressImage(file, maxSizeKB);
  return dataUrlToFile(dataUrl, file.name);
}