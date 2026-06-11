export function wrapUrl(url) {
  const id = process.env.SKIMLINKS_ID;
  if (!id || !url) return url;
  return `https://go.skimresources.com?id=${id}&xs=1&url=${encodeURIComponent(url)}`;
}
