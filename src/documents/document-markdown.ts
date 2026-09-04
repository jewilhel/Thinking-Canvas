import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  $generateNodesFromMarkdownString,
  HEADING,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  UNORDERED_LIST,
  type MultilineElementTransformer,
  type Transformer,
} from "@lexical/markdown";
import {
  $createTableNodeWithDimensions,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import { $createParagraphNode, $createTextNode } from "lexical";

import type { DocumentSettings } from "@/documents/document-schema";

export const maximumMarkdownBytes = 1024 * 1024;
export const maximumMarkdownListDepth = 8;

export class DocumentMarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentMarkdownError";
  }
}

export function isSafeDocumentLink(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateDocumentMarkdown(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  if (new TextEncoder().encode(normalized).byteLength > maximumMarkdownBytes) {
    throw new DocumentMarkdownError("Markdown must be 1 MB or smaller.");
  }
  if (normalized.includes("\0")) {
    throw new DocumentMarkdownError("Markdown contains an invalid null byte.");
  }
  for (const line of normalized.split("\n")) {
    const listMatch = line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+/);
    if (!listMatch) continue;
    const indentation = listMatch[1]!.replace(/\t/g, "    ").length;
    if (Math.floor(indentation / 2) > maximumMarkdownListDepth) {
      throw new DocumentMarkdownError(
        `Markdown lists may be nested at most ${maximumMarkdownListDepth} levels.`,
      );
    }
  }
  if (/<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?>/i.test(normalized)) {
    throw new DocumentMarkdownError("Raw HTML is not supported in documents.");
  }
  if (/!\[[^\]]*\]\([^)]*\)/.test(normalized)) {
    throw new DocumentMarkdownError(
      "Embedded images are not supported in document Markdown.",
    );
  }
  for (const match of normalized.matchAll(
    /(?<!!)\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g,
  )) {
    if (!isSafeDocumentLink(match[1]!)) {
      throw new DocumentMarkdownError(
        "Document links must use an http or https address.",
      );
    }
  }
  return normalized;
}

export function decodeDocumentMarkdownFile(
  bytes: ArrayBuffer,
  filename: string,
) {
  if (!filename.toLowerCase().endsWith(".md")) {
    throw new DocumentMarkdownError("Choose a .md Markdown file.");
  }
  if (bytes.byteLength > maximumMarkdownBytes) {
    throw new DocumentMarkdownError("Markdown must be 1 MB or smaller.");
  }
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentMarkdownError("Markdown files must contain valid UTF-8.");
  }
  return validateDocumentMarkdown(value);
}

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let value = "";
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
      value += character;
    } else if (character === "|") {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function isTableDivider(line: string, columns: number) {
  const cells = splitTableRow(line);
  return (
    cells.length === columns &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
  );
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

const textTransformers: Transformer[] = [
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
];

const tableTransformer: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export(node, traverseChildren) {
    if (!$isTableNode(node)) return null;
    const rows = node.getChildren().filter($isTableRowNode);
    if (rows.length === 0) return "";
    const serialized = rows.map((row) =>
      row
        .getChildren()
        .filter($isTableCellNode)
        .map((cell) => escapeTableCell(traverseChildren(cell))),
    );
    const columns = Math.max(1, ...serialized.map((row) => row.length));
    const line = (cells: string[]) =>
      `| ${Array.from({ length: columns }, (_, index) => cells[index] ?? "").join(" | ")} |`;
    return [
      line(serialized[0] ?? []),
      line(Array.from({ length: columns }, () => "---")),
      ...serialized.slice(1).map(line),
    ].join("\n");
  },
  regExpStart: /^\s*\|?.+\|.+\|?\s*$/,
  handleImportAfterStartMatch({ lines, rootNode, startLineIndex }) {
    const headings = splitTableRow(lines[startLineIndex]!);
    if (
      headings.length < 2 ||
      startLineIndex + 1 >= lines.length ||
      !isTableDivider(lines[startLineIndex + 1]!, headings.length)
    ) {
      return null;
    }
    const rows = [headings];
    let lastLineIndex = startLineIndex + 1;
    for (let index = startLineIndex + 2; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (!line.includes("|")) break;
      const cells = splitTableRow(line);
      if (cells.length !== headings.length) break;
      rows.push(cells);
      lastLineIndex = index;
    }

    const table = $createTableNodeWithDimensions(
      rows.length,
      headings.length,
      true,
    );
    table.getChildren().forEach((rowNode, rowIndex) => {
      if (!$isTableRowNode(rowNode)) return;
      rowNode.getChildren().forEach((cellNode, columnIndex) => {
        if (!$isTableCellNode(cellNode)) return;
        const value = rows[rowIndex]?.[columnIndex] ?? "";
        const nodes = $generateNodesFromMarkdownString(value, textTransformers);
        cellNode.clear();
        if (nodes.length > 0) cellNode.append(...nodes);
        else {
          cellNode.append(
            $createParagraphNode().append($createTextNode(value)),
          );
        }
      });
    });
    rootNode.append(table);
    return [true, lastLineIndex];
  },
  replace() {
    return false;
  },
  type: "multiline-element",
};

export const documentMarkdownTransformers: Transformer[] = [
  tableTransformer,
  HEADING,
  UNORDERED_LIST,
  ORDERED_LIST,
  ...textTransformers,
];

export type DocumentMarkdownLossInventory = {
  presentationSettings: boolean;
  spatialObjectCount: number;
  commentCount: number;
  annotationCount: number;
};

export function getDocumentMarkdownLosses({
  presentationSettings,
  spatialObjectCount,
  commentCount,
  annotationCount,
}: DocumentMarkdownLossInventory) {
  const losses: string[] = [];
  if (presentationSettings) {
    losses.push(
      "Document font, reading size, background, layout, page size, and orientation",
    );
  }
  if (spatialObjectCount > 0)
    losses.push(`${spatialObjectCount} spatial object(s)`);
  if (commentCount > 0) losses.push(`${commentCount} comment(s)`);
  if (annotationCount > 0) losses.push(`${annotationCount} annotation(s)`);
  return losses;
}

export function markdownLossInventoryForSettings(
  settings: DocumentSettings,
): DocumentMarkdownLossInventory {
  void settings;
  return {
    presentationSettings: true,
    spatialObjectCount: 0,
    commentCount: 0,
    annotationCount: 0,
  };
}

export function documentMarkdownFilename(title: string) {
  const stem = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `${stem || "untitled-document"}.md`;
}

export function documentTitleFromMarkdownFilename(filename: string) {
  const title = filename.replace(/\.md$/i, "").trim().slice(0, 500);
  return title || "Untitled document";
}

export function looksLikeDocumentMarkdown(value: string) {
  return (
    /(^|\n)\s{0,3}(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s)/.test(value) ||
    /(^|\n)\s*\|?.+\|.+\|?\s*\n\s*\|?\s*:?-{3,}/.test(value) ||
    /(?:\*\*|__)[^\n]+(?:\*\*|__)/.test(value) ||
    /(?:^|[^*])\*[^*\n]+\*/.test(value) ||
    /\[[^\]]+\]\([^)]+\)/.test(value) ||
    /<\/?[a-z][^>]*>/i.test(value)
  );
}
