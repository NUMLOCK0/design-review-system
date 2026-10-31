export function materialClipboardFiles(clipboard: Pick<DataTransfer, 'files' | 'items'>): File[] {
  const files = Array.from(clipboard.files || []);
  const items = files.length ? files : Array.from(clipboard.items || []).filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
  return items.map((file, index) => {
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' } as Record<string, string>)[type];
    if (!ext) return file;
    const validName = new RegExp(`\\.${ext === 'jpg' ? '(?:jpg|jpeg)' : ext}$`, 'i').test(file.name);
    if (file.type === type && validName) return file;
    return new File([file], validName ? file.name : `粘贴素材-${Date.now()}-${index + 1}.${ext}`, { type, lastModified: file.lastModified });
  });
}
