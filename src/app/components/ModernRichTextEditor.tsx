import { useCallback, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Images,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Code,
  Upload,
  X,
  Loader2,
} from "lucide-react";
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { compressImageToFile } from "../../utils/imageCompression";

// Helper function to upload image to Supabase Storage
async function uploadImageToStorage(file: File): Promise<string> {
  try {
    console.log('📤 Uploading image to storage:', file.name);
    
    // Create unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExt = file.name.split('.').pop();
    const fileName = `description-images/${timestamp}-${randomString}.${fileExt}`;
    
    // Upload to Supabase Storage via server endpoint
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', fileName);
    
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/upload-description-image`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: formData,
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to upload image');
    }
    
    const data = await response.json();
    console.log('✅ Image uploaded successfully:', data.url);
    return data.url;
  } catch (error) {
    console.error('❌ Error uploading image:', error);
    throw error;
  }
}

interface ModernRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function ModernRichTextEditor({
  value,
  onChange,
  placeholder,
  readOnly,
}: ModernRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showMultiImageDialog, setShowMultiImageDialog] = useState(false);
  const [multiImages, setMultiImages] = useState<string[]>([]); // Changed to store URLs instead of base64
  const [uploadingMultiImages, setUploadingMultiImages] = useState(false);

  // Execute formatting command
  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }, []);

  // Handle image upload
  const handleImageUpload = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          // Show loading placeholder
          const loadingImg = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='100'%3E%3Crect width='200' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='sans-serif' font-size='14'%3EUploading...%3C/text%3E%3C/svg%3E" style="max-width: 100%; height: auto; border-radius: 8px; margin: 1em 0;" />`;
          execCommand("insertHTML", loadingImg);
          
          // Upload to storage
          const url = await uploadImageToStorage(file);
          
          // Replace loading placeholder with actual image
          if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            const updatedHtml = html.replace(loadingImg, `<img src="${url}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 1em 0;" />`);
            editorRef.current.innerHTML = updatedHtml;
            // Trigger input event to update parent
            editorRef.current.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch (error) {
          console.error('Failed to upload image:', error);
          alert('Failed to upload image. Please try again.');
        }
      }
    };
    input.click();
  }, [execCommand]);

  // Handle link insertion
  const handleLink = useCallback(() => {
    const url = prompt("Enter URL:");
    if (url) {
      execCommand("createLink", url);
    }
  }, [execCommand]);

  // Handle multiple image upload
  const handleMultiImageUpload = useCallback(() => {
    setShowMultiImageDialog(true);
    setMultiImages([]);
  }, []);

  const handleMultiImageFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setUploadingMultiImages(true);
      
      try {
        // Upload all images directly to storage
        const uploadPromises = Array.from(files).map(async (file) => {
          if (!file.type.startsWith('image/')) {
            return null;
          }
          try {
            const compressedFile = await compressImageToFile(file);
            const url = await uploadImageToStorage(compressedFile);
            return url;
          } catch (error) {
            console.error('Failed to upload image:', error);
            return null;
          }
        });

        const uploadedUrls = await Promise.all(uploadPromises);
        const validUrls = uploadedUrls.filter((url): url is string => url !== null);
        
        setMultiImages(prev => [...prev, ...validUrls]);
      } catch (error) {
        console.error('Error uploading images:', error);
        alert('Failed to upload some images. Please try again.');
      } finally {
        setUploadingMultiImages(false);
      }

      e.target.value = '';
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setUploadingMultiImages(true);
      
      try {
        // Upload all images directly to storage
        const uploadPromises = Array.from(files).map(async (file) => {
          if (!file.type.startsWith('image/')) {
            return null;
          }
          try {
            const compressedFile = await compressImageToFile(file);
            const url = await uploadImageToStorage(compressedFile);
            return url;
          } catch (error) {
            console.error('Failed to upload image:', error);
            return null;
          }
        });

        const uploadedUrls = await Promise.all(uploadPromises);
        const validUrls = uploadedUrls.filter((url): url is string => url !== null);
        
        setMultiImages(prev => [...prev, ...validUrls]);
      } catch (error) {
        console.error('Error uploading images:', error);
        alert('Failed to upload some images. Please try again.');
      } finally {
        setUploadingMultiImages(false);
      }
    }
  }, []);

  const removeMultiImage = useCallback((index: number) => {
    setMultiImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const insertMultiImages = useCallback(async () => {
    if (multiImages.length === 0) return;

    try {
      // Images are already uploaded to storage, just create the gallery HTML
      const galleryHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1em; margin: 1.5em 0;">
          ${multiImages.map(url => `
            <img src="${url}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px; border: 2px solid #e2e8f0;" />
          `).join('')}
        </div>
      `;

      execCommand("insertHTML", galleryHtml);
      setShowMultiImageDialog(false);
      setMultiImages([]);
    } catch (error) {
      console.error('Failed to insert images:', error);
      alert('Failed to insert images. Please try again.');
    }
  }, [multiImages, execCommand]);

  // Handle content change
  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      onChange(html);
    }
  }, [onChange]);

  // Toolbar button component
  const ToolbarButton = ({
    icon: Icon,
    command,
    value,
    onClick,
  }: {
    icon: any;
    command?: string;
    value?: string;
    onClick?: () => void;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0"
      onMouseDown={(e) => {
        e.preventDefault();
        if (onClick) {
          onClick();
        } else if (command) {
          execCommand(command, value);
        }
      }}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  if (readOnly) {
    return (
      <div
        className="prose max-w-none p-5 bg-slate-50 rounded-lg border border-slate-200"
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  return (
    <div className="rich-text-editor-modern">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-3 bg-white border border-slate-200 rounded-t-lg">
        {/* Text formatting */}
        <div className="flex gap-1 border-r border-slate-200 pr-2">
          <ToolbarButton icon={Type} command="formatBlock" value="h1" />
          <ToolbarButton icon={Type} command="formatBlock" value="h2" />
          <ToolbarButton icon={Type} command="formatBlock" value="h3" />
        </div>

        {/* Text style */}
        <div className="flex gap-1 border-r border-slate-200 pr-2">
          <ToolbarButton icon={Bold} command="bold" />
          <ToolbarButton icon={Italic} command="italic" />
          <ToolbarButton icon={Underline} command="underline" />
        </div>

        {/* Lists */}
        <div className="flex gap-1 border-r border-slate-200 pr-2">
          <ToolbarButton icon={List} command="insertUnorderedList" />
          <ToolbarButton icon={ListOrdered} command="insertOrderedList" />
        </div>

        {/* Alignment */}
        <div className="flex gap-1 border-r border-slate-200 pr-2">
          <ToolbarButton icon={AlignLeft} command="justifyLeft" />
          <ToolbarButton icon={AlignCenter} command="justifyCenter" />
          <ToolbarButton icon={AlignRight} command="justifyRight" />
        </div>

        {/* Media */}
        <div className="flex gap-1 border-r border-slate-200 pr-2">
          <ToolbarButton icon={LinkIcon} onClick={handleLink} />
          <ToolbarButton icon={ImageIcon} onClick={handleImageUpload} />
          <ToolbarButton icon={Images} onClick={handleMultiImageUpload} />
        </div>

        {/* Code */}
        <div className="flex gap-1">
          <ToolbarButton icon={Code} command="formatBlock" value="pre" />
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        dangerouslySetInnerHTML={{ __html: value }}
        className={`
          min-h-[500px] p-5 
          bg-white border border-slate-200 border-t-0 rounded-b-lg
          outline-none prose max-w-none
          ${isFocused ? "ring-2 ring-purple-500 ring-offset-0" : ""}
        `}
        style={{
          fontSize: "15px",
          lineHeight: "1.6",
        }}
      />

      {!value && !isFocused && (
        <div
          className="absolute top-[60px] left-5 text-slate-400 pointer-events-none"
          style={{ fontSize: "15px" }}
        >
          {placeholder}
        </div>
      )}

      <style>{`
        .rich-text-editor-modern {
          position: relative;
        }

        .rich-text-editor-modern h1 {
          font-size: 2em;
          font-weight: bold;
          margin: 0.5em 0;
        }

        .rich-text-editor-modern h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin: 0.5em 0;
        }

        .rich-text-editor-modern h3 {
          font-size: 1.25em;
          font-weight: bold;
          margin: 0.5em 0;
        }

        .rich-text-editor-modern ul,
        .rich-text-editor-modern ol {
          padding-left: 1.5em;
          margin: 1em 0;
        }

        .rich-text-editor-modern p {
          margin: 0.8em 0;
        }

        .rich-text-editor-modern pre {
          background-color: #1e293b;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 1em;
          overflow-x: auto;
          margin: 1em 0;
        }

        .rich-text-editor-modern a {
          color: #7c3aed;
          text-decoration: underline;
        }

        .rich-text-editor-modern blockquote {
          border-left: 4px solid #7c3aed;
          padding-left: 1em;
          margin-left: 0;
          color: #64748b;
          font-style: italic;
        }
      `}</style>

      {/* Multi-Image Upload Dialog */}
      <Dialog open={showMultiImageDialog} onOpenChange={setShowMultiImageDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insert Multiple Images</DialogTitle>
            <DialogDescription>
              Upload multiple images to create an image gallery in your description
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors bg-slate-50"
            >
              <div className="flex flex-col items-center gap-3">
                {uploadingMultiImages ? (
                  <>
                    <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
                    <p className="text-sm font-medium text-slate-700">Processing images...</p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
                      <Upload className="w-7 h-7 text-purple-600" />
                    </div>
                    <div>
                      <label htmlFor="multi-image-upload" className="cursor-pointer">
                        <span className="text-sm font-medium text-purple-600 hover:text-purple-700">
                          Click to upload
                        </span>
                        <span className="text-sm text-slate-500"> or drag and drop</span>
                      </label>
                      <p className="text-xs text-slate-500 mt-1">
                        PNG, JPG, GIF - Upload multiple files at once
                      </p>
                    </div>
                    <input
                      id="multi-image-upload"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleMultiImageFileSelect}
                      className="hidden"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Image Preview Grid */}
            {multiImages.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Selected Images ({multiImages.length})
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMultiImages([])}
                  >
                    Clear All
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {multiImages.map((img, idx) => (
                    <div key={idx} className="relative group aspect-square">
                      <img
                        src={img}
                        alt={`Upload ${idx + 1}`}
                        className="w-full h-full object-cover rounded-lg border-2 border-slate-200"
                      />
                      <button
                        onClick={() => removeMultiImage(idx)}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                        {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowMultiImageDialog(false);
                  setMultiImages([]);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={insertMultiImages}
                disabled={multiImages.length === 0}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Images className="w-4 h-4 mr-2" />
                Insert {multiImages.length} {multiImages.length === 1 ? 'Image' : 'Images'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}