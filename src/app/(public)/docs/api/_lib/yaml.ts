/**
 * Minimal block-YAML parser for openapi/poplens-v1.yaml (no YAML package is
 * installed). Supports the subset that file uses: nested block mappings,
 * block sequences (of scalars or mappings), full-line comments, quoted and
 * plain scalars, flow sequences of scalars ([a, b]) and empty {} / [].
 * Not supported (throws or misreads): anchors, block scalars (| >), multi-
 * line flow collections, tabs for indentation.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [k: string]: YamlValue };

interface Line {
  indent: number;
  text: string;
  no: number;
}

const KEY_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#\[\]{},-][^:]*?|-[^\s:][^:]*?)\s*:(?:\s+(.*))?$/;

function toLines(src: string): Line[] {
  const out: Line[] = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*(#.*)?$/.test(raw)) return;
    if (/^\t/.test(raw)) throw new Error(`YAML line ${i + 1}: tabs are not supported`);
    const indent = raw.length - raw.trimStart().length;
    out.push({ indent, text: stripComment(raw.trim()), no: i + 1 });
  });
  return out;
}

/** Remove a trailing " # comment" that is outside quotes. */
function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && i > 0 && /\s/.test(s[i - 1])) return s.slice(0, i).trimEnd();
  }
  return s;
}

function unquoteKey(k: string): string {
  if (k.startsWith('"')) return JSON.parse(k) as string;
  if (k.startsWith("'")) return k.slice(1, -1).replace(/''/g, "'");
  return k.trim();
}

function splitFlow(inner: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) {
      cur += c;
      if (c === "\\" && q === '"') cur += inner[++i] ?? "";
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === ",") {
      parts.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function parseScalar(s: string): YamlValue {
  const t = s.trim();
  if (t === "" || t === "~" || t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "{}") return {};
  if (t === "[]") return [];
  if (t.startsWith("[") && t.endsWith("]")) return splitFlow(t.slice(1, -1)).map(parseScalar);
  if (t.startsWith('"')) return JSON.parse(t) as string;
  if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);
  return t;
}

function isSeqItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

function parseBlock(lines: Line[], i: number, indent: number): [YamlValue, number] {
  if (i >= lines.length) return [null, i];
  return isSeqItem(lines[i].text) ? parseSeq(lines, i, indent) : parseMap(lines, i, indent);
}

function parseSeq(lines: Line[], i: number, indent: number): [YamlValue[], number] {
  const out: YamlValue[] = [];
  while (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i].text)) {
    const rest = lines[i].text === "-" ? "" : lines[i].text.slice(2).trim();
    const itemIndent = indent + 2;
    if (rest === "") {
      const [v, n] = i + 1 < lines.length && lines[i + 1].indent > indent ? parseBlock(lines, i + 1, lines[i + 1].indent) : [null, i + 1];
      out.push(v);
      i = n;
    } else if (KEY_RE.test(rest) && !rest.startsWith("[") && !rest.startsWith("{")) {
      // "- key: value" starts a mapping whose entries sit at indent + 2.
      const virtual: Line[] = [...lines];
      virtual[i] = { indent: itemIndent, text: rest, no: lines[i].no };
      const [v, n] = parseMap(virtual, i, itemIndent);
      out.push(v);
      i = n;
    } else {
      out.push(parseScalar(rest));
      i++;
    }
  }
  return [out, i];
}

function parseMap(lines: Line[], i: number, indent: number): [{ [k: string]: YamlValue }, number] {
  const out: { [k: string]: YamlValue } = {};
  while (i < lines.length && lines[i].indent === indent && !isSeqItem(lines[i].text)) {
    const m = KEY_RE.exec(lines[i].text);
    if (!m) throw new Error(`YAML line ${lines[i].no}: expected "key: value", got "${lines[i].text}"`);
    const key = unquoteKey(m[1]);
    const rest = m[2]?.trim() ?? "";
    if (rest !== "") {
      out[key] = parseScalar(rest);
      i++;
    } else if (i + 1 < lines.length && lines[i + 1].indent > indent) {
      const [v, n] = parseBlock(lines, i + 1, lines[i + 1].indent);
      out[key] = v;
      i = n;
    } else if (i + 1 < lines.length && lines[i + 1].indent === indent && isSeqItem(lines[i + 1].text)) {
      // Sequence at the same indent as its key (valid YAML).
      const [v, n] = parseSeq(lines, i + 1, indent);
      out[key] = v;
      i = n;
    } else {
      out[key] = null;
      i++;
    }
  }
  if (i < lines.length && lines[i].indent > indent) {
    throw new Error(`YAML line ${lines[i].no}: unexpected indentation`);
  }
  return [out, i];
}

export function parseYaml(src: string): YamlValue {
  const lines = toLines(src);
  if (lines.length === 0) return null;
  const [v, n] = parseBlock(lines, 0, lines[0].indent);
  if (n < lines.length) throw new Error(`YAML line ${lines[n].no}: could not parse "${lines[n].text}"`);
  return v;
}
