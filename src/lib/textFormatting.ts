import DOMPurify from 'dompurify';

/**
 * Wraps selected text in a textarea with the given HTML tag.
 * Returns the new text and new cursor position.
 */
export function wrapSelectionWithTag(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  tag: 'b' | 'i' | 'u',
): { text: string; cursorPos: number } {
  const before = text.substring(0, selectionStart);
  const selected = text.substring(selectionStart, selectionEnd);
  const after = text.substring(selectionEnd);

  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;

  // If selection is already wrapped, unwrap it
  if (selected.startsWith(openTag) && selected.endsWith(closeTag)) {
    const unwrapped = selected.slice(openTag.length, -closeTag.length);
    return {
      text: before + unwrapped + after,
      cursorPos: selectionStart + unwrapped.length,
    };
  }

  const wrapped = openTag + selected + closeTag;
  return {
    text: before + wrapped + after,
    cursorPos: selectionStart + wrapped.length,
  };
}

/**
 * Wraps selected text with an inline color span.
 */
export function wrapSelectionWithColor(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  color: string,
): { text: string; cursorPos: number } {
  const before = text.substring(0, selectionStart);
  const selected = text.substring(selectionStart, selectionEnd);
  const after = text.substring(selectionEnd);

  if (!selected) return { text, cursorPos: selectionStart };

  // If already color-wrapped, replace color or remove
  const colorMatch = selected.match(/^<span style="color:([^"]+)">([\s\S]*)<\/span>$/);
  if (colorMatch) {
    // Remove color wrapper
    return {
      text: before + colorMatch[2] + after,
      cursorPos: selectionStart + colorMatch[2].length,
    };
  }

  const wrapped = `<span style="color:${color}">${selected}</span>`;
  return {
    text: before + wrapped + after,
    cursorPos: selectionStart + wrapped.length,
  };
}

/**
 * Sanitize and render text with allowed formatting tags.
 * Allows <b>, <i>, <u>, <span> with style (for inline colors).
 */
export function sanitizeFormattedText(text: string): string {
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'span'],
    ALLOWED_ATTR: ['style'],
  });
}

/**
 * Strip formatting tags for search/processing purposes.
 */
export function stripFormatting(text: string): string {
  return text.replace(/<\/?(?:b|i|u|span)[^>]*>/g, '');
}
