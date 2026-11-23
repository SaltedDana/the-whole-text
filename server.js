import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = process.env.PORT || 4319;
const MODEL = "claude-fable-5-2";
const MAX_WORDS = 10000;
const CHUNK_WORDS = 700;

// Credentials come from the environment (ANTHROPIC_API_KEY). Never from code.
const client = new Anthropic();

const GROUPS = [
  "addition", "contrast", "concession", "cause", "result", "alternative",
  "condition", "sequence", "example", "restatement", "emphasis", "similarity",
  "summary", "purpose", "topic", "attribution", "certainty",
];

const AnnotationSchema = z.object({
  annotations: z.array(
    z.object({
      sentence: z.number().int(),
      connector: z.string(),
      occurrence: z.number().int(),
      group: z.enum(GROUPS),
      layout: z.enum(["pair", "sequence", "example", "summary", "mark"]),
      before_start: z.number().int(),
      after_end: z.number().int(),
    })
  ),
});

const OverviewSchema = z.object({
  gist: z.string(),
  parts: z.array(
    z.object({
      type: z.enum([
        "story", "example", "main_point", "explanation", "evidence",
        "background", "counterpoint", "summary",
      ]),
      label: z.string(),
      start: z.number().int(),
      end: z.number().int(),
    })
  ),
});

const ANNOTATE_SYSTEM = `You annotate connecting words (discourse connectors) in an English text so a reading app can show the text's structure visually. The app renders the ORIGINAL text; you only return pointers. You never rewrite, quote at length, or correct the text.

The input is a list of numbered sentences: "[12] sentence text". Blank lines separate paragraphs.

For each connecting word worth showing, return one annotation:
- sentence: the number of the sentence that contains the connector.
- connector: the connector exactly as written in that sentence, same letters and case (e.g. "However", "for example", "or"). It must be an actual connecting word or fixed connecting phrase, one to five words long: but, however, or, because, so, therefore, if, first, for example, in other words, in fact, in conclusion, and the like. Never return a content phrase or a clause ("it stores your verdicts", "was never taste"). When a relation is only implied by punctuation such as a dash or a colon, or by sentence order, with no connecting word, return nothing for it.
- occurrence: which occurrence of that exact string inside the sentence, counting from 1.
- group: one of addition, contrast, concession, cause, result, alternative, condition, sequence, example, restatement, emphasis, similarity, summary, purpose, topic, attribution, certainty. Choose by the job the word does in THIS sentence. Words such as since, as, while, so, like, still, yet, once, for can do two jobs; read the whole sentence and decide.
- layout: how the app shows it.
  - "pair": two boxes side by side, for contrast, concession, or alternative, when the connector joins two substantial sides (each side is a full clause or more). The "before" side is the text from sentence before_start up to the connector; the "after" side is the text from the connector to the end of sentence after_end.
  - "sequence": a numbered step, for ordering words (first, second, next, then, finally) that walk through a list of points or steps. The step covers the connector's sentence through after_end.
  - "example": a separate, skippable example block, for "for example", "for instance", "to illustrate" when the example is at least one full sentence. It covers the connector's sentence through after_end.
  - "summary": a large highlighted block, for summary words (in conclusion, overall, in short) and for result words (therefore, thus, as a result) that deliver a conclusion the reader should remember. It covers the connector's sentence through after_end.
  - "mark": only a small symbol next to the word, no layout change. Use for everything else worth noticing: emphasis, cause, condition, restatement, certainty, attribution, and for contrast/alternative/example connectors that join only single words or short phrases ("tea or coffee", "small but fast", "tools such as X").
- before_start: for "pair", the first sentence of the "before" side. If both sides are inside the connector's own sentence, use the same number as sentence. If the connector opens its sentence (e.g. "However, ..."), the "before" side is the previous sentence or sentences in the same paragraph. For other layouts, use the same number as sentence.
- after_end: the last sentence that belongs to the "after" side or to the block. Usually the connector's own sentence. Extend it only when the following sentences clearly continue the same side, step, example, or conclusion. Stay inside the paragraph.

Selectivity matters, because too much marking makes the page unreadable. Skip plain "and", "also", "or", "but" that join words or short phrases. Skip connectors that carry no structural weight. Prefer the ones that change direction or flag an important point: contrast, concession, alternatives between real options, ordered steps, examples, conclusions, summaries, emphasis. A typical paragraph gets one to three annotations, and at most one or two of them use a layout other than "mark". Blocks must not overlap each other.`;

const OVERVIEW_SYSTEM = `You prepare a short orientation map that a reader sees before reading an English text. The reader will read the full original text afterwards; the map tells them what is ahead so they know what to expect.

The input is a list of numbered sentences: "[12] sentence text".

Return:
- gist: one or two plain sentences (40 words at most) saying what the text is about and where it ends up. Simple words. No hype.
- parts: the text divided into consecutive parts in reading order, covering every sentence from the first to the last with no gaps and no overlaps. Aim for 3 to 8 parts. For each part:
  - type: story (an anecdote or narrative), example (a concrete case that illustrates a point), main_point (the central claim), explanation (how or why something works), evidence (data, studies, sources), background (context the reader needs), counterpoint (an objection or the other side), summary (the wrap-up or conclusion).
  - label: 3 to 7 words naming what this part contains, in plain language.
  - start, end: the first and last sentence numbers of the part.

Describe only what is in the text. Do not add information from outside it.`;

function segment(text) {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  const paraTexts = clean.split(/\n\s*\n+/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  let id = 0;
  const paragraphs = [];
  for (const p of paraTexts) {
    const sentences = [];
    for (const s of seg.segment(p)) {
      if (!s.segment.trim()) continue;
      sentences.push({ id: ++id, text: s.segment });
    }
    if (sentences.length) paragraphs.push({ sentences });
  }
  return paragraphs;
}

const wordCount = (t) => (t.trim().match(/\S+/g) || []).length;

function numbered(paragraphs) {
  return paragraphs
    .map((p) => p.sentences.map((s) => `[${s.id}] ${s.text.trim()}`).join("\n"))
    .join("\n\n");
}

function chunk(paragraphs) {
  const chunks = [];
  let cur = [];
  let words = 0;
  for (const p of paragraphs) {
    const w = p.sentences.reduce((n, s) => n + wordCount(s.text), 0);
    if (cur.length && words + w > CHUNK_WORDS) {
      chunks.push(cur);
      cur = [];
      words = 0;
    }
    cur.push(p);
    words += w;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

async function ask(system, user, schema, effort) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this text.");
  if (!response.parsed_output) throw new Error("The model returned an unreadable answer.");
  return response.parsed_output;
}

// Keep only annotations whose connector really sits where the model said.
function verify(annotations, paragraphs) {
  const byId = new Map();
  paragraphs.forEach((p, pi) => p.sentences.forEach((s) => byId.set(s.id, { s, pi, first: p.sentences[0].id, last: p.sentences.at(-1).id })));
  const out = [];
  let dropped = 0;
  for (const a of annotations) {
    const hit = byId.get(a.sentence);
    if (!hit || !a.connector.trim() || wordCount(a.connector) > 5) { dropped++; continue; }
    const text = hit.s.text;
    let pos = -1;
    let from = 0;
    for (let i = 0; i < Math.max(1, a.occurrence); i++) {
      pos = text.indexOf(a.connector, from);
      if (pos === -1) break;
      from = pos + a.connector.length;
    }
    if (pos === -1) {
      pos = text.toLowerCase().indexOf(a.connector.toLowerCase());
      if (pos === -1) { dropped++; continue; }
    }
    const end = pos + a.connector.length;
    // The connector must be a whole word or phrase, not a fragment of a longer word.
    if (/\w/.test(text[pos - 1] || "") || /\w/.test(text[end] || "")) { dropped++; continue; }
    out.push({
      sentence: a.sentence,
      pos,
      end,
      group: a.group,
      layout: a.layout,
      before_start: Math.min(a.sentence, Math.max(hit.first, a.before_start)),
      after_end: Math.max(a.sentence, Math.min(hit.last, a.after_end)),
    });
  }
  return { annotations: out, dropped };
}

function cleanParts(parts, lastId) {
  const sorted = parts
    .filter((p) => p.start >= 1 && p.start <= lastId)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const p of sorted) {
    if (out.length && p.start <= out.at(-1).start) continue;
    out.push({ type: p.type, label: p.label, start: p.start });
  }
  if (!out.length) return [];
  out[0].start = 1;
  out.forEach((p, i) => (p.end = i + 1 < out.length ? out[i + 1].start - 1 : lastId));
  return out;
}

async function analyze(text) {
  const paragraphs = segment(text);
  if (!paragraphs.length) throw new Error("No text found.");
  const words = wordCount(text);
  if (words > MAX_WORDS) throw new Error(`This text has ${words} words. The limit for now is ${MAX_WORDS}.`);
  const lastId = paragraphs.at(-1).sentences.at(-1).id;

  const [overview, ...annotated] = await Promise.all([
    ask(OVERVIEW_SYSTEM, numbered(paragraphs), OverviewSchema, "low"),
    ...chunk(paragraphs).map((c) => ask(ANNOTATE_SYSTEM, numbered(c), AnnotationSchema, "low")),
  ]);

  const { annotations, dropped } = verify(annotated.flatMap((r) => r.annotations), paragraphs);
  return {
    paragraphs,
    annotations,
    dropped,
    overview: { gist: overview.gist, parts: cleanParts(overview.parts, lastId) },
    stats: { words, sentences: lastId, paragraphs: paragraphs.length },
  };
}

async function fetchArticle(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https links are supported.");
  const res = await fetch(u, {
    headers: { "user-agent": "Mozilla/5.0 (reader)", accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`The site answered ${res.status}. Paste the text instead.`);
  const html = await res.text();
  const dom = new JSDOM(html, { url: u.href });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.content) throw new Error("Could not find an article on that page. Paste the text instead.");
  const body = new JSDOM(article.content).window.document;
  const BLOCKS = "p, li, blockquote, h2, h3";
  // Take only the innermost blocks, so a <p> inside an <li> is not read twice.
  const blocks = [...body.querySelectorAll(BLOCKS)]
    .filter((el) => !el.querySelector(BLOCKS))
    .map((el) => el.textContent.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);
  const text = blocks.length ? blocks.join("\n\n") : (article.textContent || "").trim();
  return { title: article.title || "", text };
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const part of req) {
    raw += part;
    if (raw.length > 2_000_000) throw new Error("Request too large.");
  }
  return JSON.parse(raw || "{}");
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/api/analyze") {
        const { text } = await readJson(req);
        return send(res, 200, await analyze(String(text || "")));
      }
      if (req.method === "POST" && req.url === "/api/fetch") {
        const { url } = await readJson(req);
        return send(res, 200, await fetchArticle(String(url || "")));
      }
      if (req.method === "GET") {
        const rel = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
        const file = path.normalize(path.join(PUBLIC, rel));
        if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "content-type": (TYPES[path.extname(file)] || "application/octet-stream") + "; charset=utf-8" });
        return fs.createReadStream(file).pipe(res);
      }
      res.writeHead(405);
      res.end();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Anthropic.APIError ? `Model error (${err.status ?? "network"}). Try again.` : err.message || "Something went wrong.";
      send(res, 500, { error: msg });
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Connecting Words Reader: http://localhost:${PORT}`));
