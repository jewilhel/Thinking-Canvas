import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { HeadingNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { createEditor } from "lexical";
import { describe, expect, it } from "vitest";

import {
  DocumentMarkdownError,
  decodeDocumentMarkdownFile,
  documentMarkdownFilename,
  documentMarkdownTransformers,
  getDocumentMarkdownLosses,
  isSafeDocumentLink,
  maximumMarkdownBytes,
  validateDocumentMarkdown,
} from "@/documents/document-markdown";

function roundTrip(markdown: string) {
  const editor = createEditor({
    namespace: "document-markdown-test",
    nodes: [
      HeadingNode,
      LinkNode,
      ListItemNode,
      ListNode,
      TableCellNode,
      TableNode,
      TableRowNode,
    ],
    onError(error) {
      throw error;
    },
  });
  editor.update(
    () => {
      $convertFromMarkdownString(
        validateDocumentMarkdown(markdown),
        documentMarkdownTransformers,
      );
    },
    { discrete: true },
  );
  return editor
    .getEditorState()
    .read(() => $convertToMarkdownString(documentMarkdownTransformers));
}

describe("document Markdown contract", () => {
  it("round trips the approved semantic GFM subset deterministically", () => {
    const markdown = [
      "# Project brief",
      "",
      "A **bold** and *thoughtful* [reference](https://example.com/path).",
      "",
      "- First item",
      "- Second item",
      "",
      "1. One",
      "2. Two",
      "",
      "| Topic | Owner |",
      "| --- | --- |",
      "| **Scope** | Editor |",
    ].join("\n");

    const once = roundTrip(markdown);
    expect(once).toContain("# Project brief");
    expect(once).toContain("A **bold** and *thoughtful*");
    expect(once).toContain("[reference](https://example.com/path)");
    expect(once).toContain("| Topic | Owner |");
    expect(once).toContain("| **Scope** | Editor |");
    expect(roundTrip(once)).toBe(once);
  });

  it.each([
    ["CRLF", "## Heading\r\n\r\nParagraph"],
    ["Unicode", "## Résumé 🚀\n\n**naïve**"],
    ["alternate emphasis", "__bold__ and _italic_"],
    ["empty", ""],
  ])("normalizes %s input to a stable semantic result", (_label, markdown) => {
    const once = roundTrip(markdown);
    expect(roundTrip(once)).toBe(once);
    expect(once).not.toContain("\r");
  });

  it("rejects hostile or unsupported input before parsing", () => {
    expect(() => validateDocumentMarkdown("<script>alert(1)</script>")).toThrow(
      DocumentMarkdownError,
    );
    expect(() =>
      validateDocumentMarkdown("[run](javascript:alert(1))"),
    ).toThrow(/http or https/);
    expect(() =>
      validateDocumentMarkdown("![remote](https://example.com/a.png)"),
    ).toThrow(/images/);
    expect(() => validateDocumentMarkdown(`text\0tail`)).toThrow(/null byte/);
    expect(() =>
      validateDocumentMarkdown("a".repeat(maximumMarkdownBytes + 1)),
    ).toThrow(/1 MB/);
    expect(() =>
      validateDocumentMarkdown(`${"  ".repeat(9)}- too deep`),
    ).toThrow(/8 levels/);
  });

  it("accepts only bounded UTF-8 .md files", () => {
    const valid = new TextEncoder().encode("## Imported\r\n\r\nBody");
    expect(decodeDocumentMarkdownFile(valid.buffer, "document.md")).toBe(
      "## Imported\n\nBody",
    );
    expect(() =>
      decodeDocumentMarkdownFile(valid.buffer, "document.txt"),
    ).toThrow(/\.md/);
    expect(() =>
      decodeDocumentMarkdownFile(new Uint8Array([0xc3, 0x28]).buffer, "bad.md"),
    ).toThrow(/UTF-8/);
  });

  it("keeps generated supported documents stable across semantic round trips", () => {
    for (let index = 1; index <= 25; index += 1) {
      const generated = [
        `${"#".repeat((index % 6) + 1)} Heading ${index}`,
        "",
        `Paragraph **${index}** with *emphasis* and [link](https://example.com/${index}).`,
        "",
        `${index}. Ordered ${index}`,
      ].join("\n");
      const once = roundTrip(generated);
      expect(roundTrip(once)).toBe(once);
    }
  });

  it("accepts only absolute safe links", () => {
    expect(isSafeDocumentLink("https://example.com")).toBe(true);
    expect(isSafeDocumentLink("http://localhost:3000/path")).toBe(true);
    expect(isSafeDocumentLink("javascript:alert(1)")).toBe(false);
    expect(isSafeDocumentLink("data:text/html,unsafe")).toBe(false);
    expect(isSafeDocumentLink("/relative")).toBe(false);
  });

  it("inventories non-Markdown content without serializing it", () => {
    expect(
      getDocumentMarkdownLosses({
        presentationSettings: true,
        spatialObjectCount: 2,
        commentCount: 1,
        annotationCount: 3,
      }),
    ).toEqual([
      "Document font, reading size, background, layout, page size, and orientation",
      "2 spatial object(s)",
      "1 comment(s)",
      "3 annotation(s)",
    ]);
    expect(roundTrip("Semantic text")).toBe("Semantic text");
  });

  it("creates deterministic safe filenames", () => {
    expect(documentMarkdownFilename("  Project Résumé / Fall  ")).toBe(
      "project-resume-fall.md",
    );
    expect(documentMarkdownFilename("***")).toBe("untitled-document.md");
  });
});
