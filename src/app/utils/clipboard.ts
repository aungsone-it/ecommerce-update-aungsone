/**
 * Clipboard utility functions with proper error handling and fallback support
 */

/**
 * Safely copy text to clipboard with fallback for insecure contexts
 * @param text - The text to copy
 * @returns Promise that resolves to true if successful, false otherwise
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  // Try modern Clipboard API first (requires secure context)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("Clipboard API failed, using fallback:", err);
      return fallbackCopyTextToClipboard(text);
    }
  } else {
    // Use fallback for insecure contexts or when Clipboard API is not available
    return fallbackCopyTextToClipboard(text);
  }
};

/**
 * Fallback method using deprecated execCommand (works in insecure contexts)
 * @param text - The text to copy
 * @returns true if successful, false otherwise
 */
const fallbackCopyTextToClipboard = (text: string): boolean => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Make the textarea invisible and positioned off-screen
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  textArea.style.opacity = "0";
  
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    document.body.removeChild(textArea);
    return false;
  }
};
