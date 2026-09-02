export function pathsFromTrustedPhosphorSvg(svg: string, name: string) {
  const withoutAllowedTags = svg
    .replace(/<svg\b[^>]*>/, "")
    .replace(/<\/svg>/, "")
    .replace(/<path\s+d="[^"]+"\s*\/>/g, "")
    .trim();
  if (withoutAllowedTags) {
    throw new Error(
      `Unsupported SVG content in ${name}: ${withoutAllowedTags}`,
    );
  }
  const paths = [...svg.matchAll(/<path\s+d="([^"]+)"\s*\/>/g)].map(
    (match) => match[1]!,
  );
  if (!paths.length) throw new Error(`No vector paths found for ${name}.`);
  return paths;
}
