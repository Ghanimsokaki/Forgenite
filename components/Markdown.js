"use client";

import { useMemo, useState } from "react";
import { safeHref } from "@/lib/safeUrl";

/* ------------------------------------------------------------------ */
/*  Tiny markdown renderer (no dependencies):                          */
/*  <think> blocks (collapsible), fenced code blocks, inline code,     */
/*  bold, italic, links, autolinks, unordered/ordered lists, headings, */
/*  blockquotes. Handles unterminated fences/think-blocks while        */
/*  streaming.                                                         */
/* ------------------------------------------------------------------ */

/**
 * Split text into top-level segments of type "think" or "text".
 * Handles both closed <think>…</think> blocks and an unterminated
 * <think> (common while streaming a reasoning model). The split runs
 * BEFORE code-fence parsing so a ``` inside a thought stays literal.
 */
function splitThink(text) {
  const out = [];
  let i = 0;
  const n = text.length;
  let buf = "";

  while (i < n) {
    const open = text.indexOf("<think>", i);
    if (open === -1) {
      buf += text.slice(i);
      break;
    }
    buf += text.slice(i, open);
    if (buf) {
      out.push({ type: "text", text: buf });
      buf = "";
    }
    const innerStart = open + 7; // length of "<think>"
    const close = text.indexOf("</think>", innerStart);
    if (close === -1) {
      // Streaming: unterminated think block — treat the rest as a thought.
      out.push({
        type: "think",
        thought: text.slice(innerStart),
        open: true,
      });
      return out;
    }
    out.push({
      type: "think",
      thought: text.slice(innerStart, close),
      open: false,
    });
    i = close + 8; // length of "</think>"
    if (text[i] === "\n") i += 1;
  }

  if (buf) out.push({ type: "text", text: buf });
  return out;
}

function splitFences(text) {
  const out = [];
  let i = 0;
  let buf = "";
  const n = text.length;

  while (i < n) {
    const idx = text.indexOf("```", i);
    if (idx === -1) {
      buf += text.slice(i);
      break;
    }
    buf += text.slice(i, idx);

    const j = idx + 3;
    const nl = text.indexOf("\n", j);

    // Streaming: fence opened but the language line isn't finished yet.
    if (nl === -1) {
      if (buf) out.push({ type: "text", text: buf });
      out.push({ type: "code", lang: text.slice(j), code: "" });
      return out;
    }

    const lang = text.slice(j, nl).trim();
    const codeStart = nl + 1;
    const close = text.indexOf("```", codeStart);

    // Streaming: fence opened but never closed — treat the rest as code.
    if (close === -1) {
      if (buf) out.push({ type: "text", text: buf });
      out.push({ type: "code", lang, code: text.slice(codeStart) });
      return out;
    }

    if (buf) out.push({ type: "text", text: buf });
    out.push({
      type: "code",
      lang,
      code: text.slice(codeStart, close).replace(/\n$/, ""),
    });
    buf = "";
    i = close + 3;
    if (text[i] === "\n") i += 1;
  }

  if (buf) out.push({ type: "text", text: buf });
  return out;
}

const INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\\s<>)]+)/g;

function inline(text, kp) {
  if (!text) return null;
  const out = [];
  const re = new RegExp(INLINE_RE.source, "g");
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${kp}-i${i++}`;
    if (tok.startsWith("`")) {
      out.push(
        <code key={key} className="inline-code">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      const href = mm && safeHref(mm[2]);
      if (mm && href) {
        out.push(
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {mm[1]}
          </a>
        );
      } else if (mm) {
        out.push(mm[1]);
      } else {
        out.push(tok);
      }
    } else if (tok.startsWith("http")) {
      out.push(
        <a key={key} href={tok} target="_blank" rel="noreferrer noopener">
          {tok}
        </a>
      );
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function TextBlock({ text, kp }) {
  const lines = text.split("\n");
  const out = [];
  let list = null;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push(
        <p key={`${kp}-p${out.length}`}>{inline(para.join("\n"), `${kp}-p${out.length}`)}</p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => (
        <li key={i}>{inline(it, `${kp}-l${i}`)}</li>
      ));
      out.push(
        list.type === "ol" ? <ol key={`${kp}-ol${out.length}`}>{items}</ol> : <ul key={`${kp}-ul${out.length}`}>{items}</ul>
      );
      list = null;
    }
  };

  for (const line of lines) {
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const q = /^\s*>\s?(.*)$/.exec(line);

    if (ul) {
      flushPara();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(ul[1]);
    } else if (ol) {
      flushPara();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ol[1]);
    } else if (h) {
      flushPara();
      flushList();
      out.push(
        <div key={`${kp}-h${out.length}`} className="md-h">
          {inline(h[2], `${kp}-h${out.length}`)}
        </div>
      );
    } else if (q) {
      flushPara();
      flushList();
      out.push(
        <blockquote key={`${kp}-q${out.length}`}>{inline(q[1], `${kp}-q${out.length}`)}</blockquote>
      );
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out;
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{lang || "code"}</span>
        <button className="codeblock-copy" onClick={copy} type="button">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ThinkBlock({ thought, open: streamingOpen }) {
  // While streaming keep the block open so the user can watch reasoning
  // arrive live; once the thought is complete default to collapsed.
  const [forceOpen, setForceOpen] = useState(false);
  const isOpen = streamingOpen || forceOpen;

  const trimmed = (thought || "").replace(/^\s+|\s+$/g, "");

  return (
    <details
      className="thinkblock"
      open={isOpen}
      onToggle={(e) => {
        // Once the user manually opens it, keep it open even after streaming ends.
        if (e.currentTarget.open && !streamingOpen) setForceOpen(true);
      }}
    >
      <summary>🧠 Thinking… (click to expand)</summary>
      <pre>{trimmed || (streamingOpen ? "…" : "")}</pre>
    </details>
  );
}

export default function Markdown({ text }) {
  const segments = useMemo(() => splitThink(text || ""), [text]);
  return (
    <div className="md">
      {segments.map((seg, si) => {
        if (seg.type === "think") {
          return <ThinkBlock key={`t${si}`} thought={seg.thought} open={seg.open} />;
        }
        const blocks = splitFences(seg.text);
        return blocks.map((b, i) =>
          b.type === "code" ? (
            <CodeBlock key={`${si}-c${i}`} lang={b.lang} code={b.code} />
          ) : (
            <TextBlock key={`${si}-x${i}`} text={b.text} kp={`${si}-${i}`} />
          )
        );
      })}
    </div>
  );
}
