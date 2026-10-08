/**
 * Restricted markdown for stories (pure; unit-tested). Raw HTML is NEVER
 * passed through: the output is a small AST rendered by React (which escapes
 * all text), so `<script>` in a story body shows up as literal text.
 *
 * Supported subset:
 *   blocks  — ## / ### / #### headings (# is demoted to ##), paragraphs,
 *             > blockquotes (nested parse), - * + bullet lists, 1. ordered
 *             lists, --- rules, and {{chart …}} shortcode lines
 *   inline  — **strong**, *em* / _em_, `code`, [text](https://… | /path | #anchor)
 * Anything else renders as plain text.
 */

import type { Block, Inline } from "@/components/content/types";
import { isShortcodeLine, parseShortcode } from "./shortcode";

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const BULLET_RE = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED_RE = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;

export function parseStory(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  return parseBlocks(lines);
}

function isBlockStart(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    BULLET_RE.test(line) ||
    ORDERED_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    isShortcodeLine(line)
  );
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }

    if (isShortcodeLine(line)) {
      const raw = line.trim();
      const r = parseShortcode(raw);
      blocks.push(r.ok ? { t: "chart", spec: r.value, raw } : { t: "chart_error", raw, message: r.message });
      i++;
      continue;
    }

    // HR before bullets: "---" / "* * *" would otherwise look like a list item.
    if (HR_RE.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      const level = Math.min(4, Math.max(2, h[1]!.length)) as 2 | 3 | 4;
      blocks.push({ t: "heading", level, c: parseInline(h[2]!.replace(/\s+#+\s*$/, "").trim()) });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i]!)) {
        inner.push(QUOTE_RE.exec(lines[i]!)![1]!);
        i++;
      }
      blocks.push({ t: "quote", c: parseBlocks(inner) });
      continue;
    }

    const isBullet = BULLET_RE.test(line);
    const isOrdered = !isBullet && ORDERED_RE.test(line);
    if (isBullet || isOrdered) {
      const re = isBullet ? BULLET_RE : ORDERED_RE;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        const m = re.exec(l);
        if (m && !HR_RE.test(l)) {
          items.push(m[1]!);
          i++;
        } else if (items.length > 0 && l.trim() !== "" && /^\s{2,}/.test(l) && !isBlockStart(l.trim())) {
          // Indented continuation of the previous item.
          items[items.length - 1] += ` ${l.trim()}`;
          i++;
        } else {
          break;
        }
      }
      blocks.push({ t: "list", ordered: isOrdered, items: items.map((it) => parseInline(it.trim())) });
      continue;
    }

    // Paragraph: consecutive non-blank lines that do not start another block.
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && (para.length === 0 || !isBlockStart(lines[i]!))) {
      para.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ t: "paragraph", c: parseInline(para.join(" ")) });
  }
  return blocks;
}

/** Only these link targets are rendered as links; anything else becomes text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\/[^\s]+$/i.test(h)) return h;
  if (/^mailto:[^\s]+$/i.test(h)) return h;
  if (/^\/(?!\/)[^\s]*$/.test(h)) return h;
  if (/^#[A-Za-z0-9_-]*$/.test(h)) return h;
  return null;
}

const isWordChar = (c: string | undefined) => c != null && /[A-Za-z0-9]/.test(c);

/** Find the closing single emphasis marker (skipping doubled markers). */
function findEmClose(s: string, ch: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] !== ch) continue;
    if (s[j + 1] === ch) {
      j++;
      continue;
    }
    if (/\s/.test(s[j - 1] ?? " ")) continue;
    if (ch === "_" && isWordChar(s[j + 1])) continue;
    return j;
  }
  return -1;
}

function findDoubleClose(s: string, marker: string, from: number): number {
  for (let j = from; j < s.length - 1; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s.startsWith(marker, j) && !/\s/.test(s[j - 1] ?? " ")) return j;
  }
  return -1;
}

/** Index of the `]` matching the `[` at `open`, honouring nesting; -1 if none. */
function findBracketClose(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "[") depth++;
    else if (s[j] === "]") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Index of the `)` matching the `(` at `open` (balanced); -1 if none. */
function findParenClose(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === "(") depth++;
    else if (s[j] === ")") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      const last = out[out.length - 1];
      if (last && last.t === "text") last.v += buf;
      else out.push({ t: "text", v: buf });
      buf = "";
    }
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    const next = s[i + 1];

    if (ch === "\\" && next != null && /[\\`*_[\]()#>!{}+.-]/.test(next)) {
      buf += next;
      i += 2;
      continue;
    }

    if (ch === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if ((ch === "*" || ch === "_") && next === ch) {
      const opensOk = ch === "*" || !isWordChar(s[i - 1]);
      const end = opensOk && !/\s/.test(s[i + 2] ?? " ") ? findDoubleClose(s, ch + ch, i + 2) : -1;
      if (end > i + 2 && (ch === "*" || !isWordChar(s[end + 2]))) {
        flush();
        out.push({ t: "strong", c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if ((ch === "*" || ch === "_") && next !== ch) {
      const opensOk = (ch === "*" || !isWordChar(s[i - 1])) && next != null && !/\s/.test(next);
      const end = opensOk ? findEmClose(s, ch, i + 1) : -1;
      if (end > i + 1) {
        flush();
        out.push({ t: "em", c: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "[") {
      const close = findBracketClose(s, i);
      if (close > i && s[close + 1] === "(") {
        const end = findParenClose(s, close + 1);
        if (end > close + 1) {
          const href = safeHref(s.slice(close + 2, end));
          const label = s.slice(i + 1, close);
          flush();
          if (href) out.push({ t: "link", href, c: parseInline(label) });
          else out.push(...parseInline(label));
          i = end + 1;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Plain text of inline nodes (for alt text, heading ids, summaries). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.t === "text" || n.t === "code" ? n.v : inlineText(n.c)))
    .join("");
}
