import { lazy, Suspense } from 'react';

// Dynamically import the emoji picker to avoid build cache issues
const EmojiPickerReact = lazy(() => import('emoji-picker-react'));

export type EmojiClickData = {
  emoji: string;
  [key: string]: any;
};

interface EmojiPickerProps {
  onEmojiClick: (emojiData: EmojiClickData) => void;
  width?: number;
  height?: number;
}

export function EmojiPicker({ onEmojiClick, width = 320, height = 400 }: EmojiPickerProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-8">Loading...</div>}>
      <EmojiPickerReact 
        onEmojiClick={onEmojiClick}
        width={width}
        height={height}
      />
    </Suspense>
  );
}
