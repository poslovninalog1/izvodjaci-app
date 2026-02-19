/**
 * Strip HTML tags and dangerous characters from text before embedding in a PDF.
 * Prevents XSS-style injection into the generated document.
 */
export function sanitize(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""); // strip control chars
}
