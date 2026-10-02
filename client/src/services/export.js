// Minimal HTML (TipTap output) -> Markdown converter for the Export feature.
// Covers the subset the editor produces: headings, bold/italic/underline,
// inline code, bullet/numbered lists, paragraphs. Anything else degrades
// gracefully to plain text lines.

export function htmlToMarkdown(html) {
  let md = String(html || '');
  md = md.replace(/<\/(h[1-3]|p|ul|ol)>/gi, '\n\n').replace(/<li>/gi, '');
  md = md.replace(/<\/?(ul|ol|div|section|article)[^>]*>/gi, '');
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => '# ' + inline(t) + '\n\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => '## ' + inline(t) + '\n\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => '### ' + inline(t) + '\n\n');
  // Lists need block-level handling before generic paragraph conversion.
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, t) => {
    let i = 0;
    return t.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, li) => ++i + '. ' + inline(li).trim() + '\n') + '\n';
  });
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, t) =>
    t.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, li) => '- ' + inline(li).trim() + '\n') + '\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => inline(t).trim() + '\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = inline(md);
  md = md.replace(/<[^>]+>/g, '');
  return decode(md).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function inline(t) {
  return String(t)
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '__$1__')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
}

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title, ext) {
  const base = String(title || 'Untitled Document').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 120) || 'Untitled Document';
  return base + ext;
}
