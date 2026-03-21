import { useRef, useMemo } from 'react';
import ReactQuill from 'react-quill';
import { ImagePlus } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function RichTextEditor({ value, onChange, placeholder = "Write your content here...", readOnly }: RichTextEditorProps) {
  const quillRef = useRef<ReactQuill>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image file upload and compression
  const handleImageUpload = async (file: File) => {
    try {
      // Show loading toast
      toast.loading('Uploading image...', { id: 'image-upload' });

      // Compress image to 500KB maximum
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/jpeg' as const,
      };
      
      console.log(`📦 Original image size: ${(file.size / 1024).toFixed(2)} KB`);
      const compressedFile = await imageCompression(file, options);
      console.log(`✅ Compressed image size: ${(compressedFile.size / 1024).toFixed(2)} KB`);
      
      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        
        // Insert image into editor
        const quill = quillRef.current?.getEditor();
        if (quill) {
          const range = quill.getSelection(true);
          if (range) {
            quill.insertEmbed(range.index, 'image', base64);
            quill.setSelection(range.index + 1, 0);
          }
          toast.success('Image uploaded successfully!', { id: 'image-upload' });
        }
      };
      
      reader.onerror = () => {
        toast.error('Failed to read image file', { id: 'image-upload' });
      };
      
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image', { id: 'image-upload' });
    }
  };

  // Handle image button click
  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.indexOf('image') !== -1) {
      handleImageUpload(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Quill modules configuration with custom image handler
  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['blockquote', 'code-block'],
        ['link'],
        ['clean']
      ],
    },
    clipboard: {
      matchVisual: false,
    }
  }), []);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'blockquote', 'code-block',
    'link', 'image'
  ];

  if (readOnly) {
    return (
      <div className="rich-text-editor-readonly">
        <ReactQuill
          value={value}
          readOnly={true}
          theme="snow"
          modules={{ toolbar: false }}
        />
        <style>{`
          .rich-text-editor-readonly .ql-container {
            border: none;
            font-size: 15px;
          }
          .rich-text-editor-readonly .ql-editor {
            padding: 0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="rich-text-editor border border-slate-200 rounded-lg overflow-hidden bg-white">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Custom image upload button */}
      <div className="border-b border-slate-200 bg-slate-50 p-2 flex items-center gap-2">
        <button
          onClick={handleImageButtonClick}
          className="p-2 rounded hover:bg-purple-100 transition text-slate-700 bg-purple-50 flex items-center gap-1 text-sm"
          type="button"
          title="Upload Image (or paste)"
        >
          <ImagePlus className="w-4 h-4" />
          <span className="text-xs">Add Image</span>
        </button>
        <span className="text-xs text-slate-400">
          💡 Tip: Paste images directly into the editor
        </span>
      </div>

      {/* Quill Editor */}
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />

      <style>{`
        .rich-text-editor .ql-toolbar {
          border: none;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
          padding: 12px;
        }
        
        .rich-text-editor .ql-container {
          border: none;
          font-size: 15px;
          min-height: 500px;
        }
        
        .rich-text-editor .ql-editor {
          min-height: 500px;
          padding: 20px;
          padding-bottom: 40px;
          line-height: 1.6;
        }
        
        .rich-text-editor .ql-editor.ql-blank::before {
          color: #94a3b8;
          font-style: normal;
        }

        /* Quill toolbar button styling */
        .rich-text-editor .ql-toolbar button {
          width: 32px;
          height: 32px;
          border-radius: 4px;
        }

        .rich-text-editor .ql-toolbar button:hover {
          background: #e2e8f0;
        }

        .rich-text-editor .ql-toolbar button.ql-active {
          background: #ede9fe;
          color: #7c3aed;
        }

        .rich-text-editor .ql-toolbar .ql-stroke {
          stroke: #64748b;
        }

        .rich-text-editor .ql-toolbar button.ql-active .ql-stroke {
          stroke: #7c3aed;
        }

        .rich-text-editor .ql-toolbar .ql-fill {
          fill: #64748b;
        }

        .rich-text-editor .ql-toolbar button.ql-active .ql-fill {
          fill: #7c3aed;
        }

        /* Content styling */
        .rich-text-editor .ql-editor h1 {
          font-size: 2em;
          font-weight: bold;
          margin-bottom: 0.5em;
          margin-top: 0.5em;
          line-height: 1.2;
        }
        
        .rich-text-editor .ql-editor h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin-bottom: 0.5em;
          margin-top: 0.5em;
          line-height: 1.3;
        }
        
        .rich-text-editor .ql-editor h3 {
          font-size: 1.25em;
          font-weight: bold;
          margin-bottom: 0.5em;
          margin-top: 0.5em;
          line-height: 1.4;
        }
        
        .rich-text-editor .ql-editor blockquote {
          border-left: 4px solid #7c3aed;
          padding-left: 1em;
          margin-left: 0;
          color: #64748b;
          font-style: italic;
          margin: 1em 0;
        }
        
        .rich-text-editor .ql-editor pre {
          background-color: #1e293b;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 1em;
          overflow-x: auto;
          margin: 1em 0;
        }
        
        .rich-text-editor .ql-editor code {
          background-color: #1e293b;
          color: #e2e8f0;
          padding: 0.2em 0.4em;
          border-radius: 4px;
          font-size: 0.9em;
        }
        
        .rich-text-editor .ql-editor a {
          color: #7c3aed;
          text-decoration: underline;
        }

        /* Image styling */
        .rich-text-editor .ql-editor img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 1.5em 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          display: block;
        }
      `}</style>
    </div>
  );
}