import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";

export const productDocumentLexicalNodes = [
  HeadingNode,
  LinkNode,
  ListItemNode,
  ListNode,
  TableCellNode,
  TableNode,
  TableRowNode,
];

export const productDocumentLexicalTheme = {
  heading: {
    h1: "mb-4 mt-8 text-4xl font-bold",
    h2: "mb-3 mt-7 text-3xl font-bold",
    h3: "mb-3 mt-6 text-2xl font-semibold",
    h4: "mb-2 mt-5 text-xl font-semibold",
    h5: "mb-2 mt-4 text-lg font-semibold",
    h6: "mb-2 mt-4 text-base font-semibold",
  },
  link: "text-violet-700 underline underline-offset-2",
  list: {
    listitem: "ml-6",
    nested: { listitem: "list-none" },
    ol: "my-3 list-decimal",
    ul: "my-3 list-disc",
  },
  paragraph: "my-2",
  table: "my-4 w-full border-collapse",
  tableScrollableWrapper: "max-w-full overflow-x-auto",
  tableCell: "min-w-24 border border-zinc-300 p-2 align-top",
  tableCellHeader:
    "min-w-24 border border-zinc-300 bg-zinc-100 p-2 text-left font-semibold align-top",
  tableRow: "border-b border-zinc-300",
  text: {
    bold: "font-bold",
    italic: "italic",
  },
};
