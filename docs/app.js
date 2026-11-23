// Connecting Words Reader. Renders the ORIGINAL text from the server's sentence list
// plus verified annotations. Text is always inserted with textContent, never as HTML.

const GROUPS = {
  addition: { sym: "+", name: "Addition", says: "One more point, same direction" },
  contrast: { sym: "⇄", name: "Contrast", says: "The text turns around, or two sides face each other" },
  concession: { sym: "↷", name: "Concession", says: "The writer admits an opposing point, then returns to their claim" },
  cause: { sym: "∵", name: "Cause", says: "Why did it happen?" },
  result: { sym: "∴", name: "Result and conclusion", says: "So what follows from this?" },
  alternative: { sym: "?", name: "Option versus option", says: "Two things are presented as alternatives" },
  condition: { sym: "⇒", name: "Condition", says: "True only if something else happens" },
  sequence: { sym: "1 2 3", name: "Order and time", says: "What comes after what?" },
  example: { sym: "( )", name: "Example", says: "Here is a specific case" },
  restatement: { sym: "=", name: "Restatement", says: "The same idea in other words" },
  emphasis: { sym: "★", name: "Emphasis", says: "This is the main thing" },
  similarity: { sym: "≈", name: "Similarity", says: "What is true there is true here too" },
  summary: { sym: "Σ", name: "Summary", says: "The bottom line" },
  purpose: { sym: "◎", name: "Purpose", says: "What is this done for?" },
  topic: { sym: "§", name: "Topic shift", says: "The writer moves to something else" },
  attribution: { sym: "“ ”", name: "Who is speaking", says: "The writer's voice or a quoted voice?" },
  certainty: { sym: "%", name: "Degree of certainty", says: "How sure is the writer?" },
};
const PART_NAMES = {
  story: "Story", example: "Example", main_point: "Main point", explanation: "Explanation",
  evidence: "Evidence", background: "Background", counterpoint: "Counterpoint", summary: "Summary",
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const words = (t) => (t.trim().match(/\S+/g) || []).length;

let data = null;
let view = "structured";

function setStatus(msg, isError) {
  $("status").textContent = msg || "";
  $("status").classList.toggle("error", !!isError);
}

async function post(url, body) {
  // Public preview: no server here. It shows a saved result for the sample text.
  if (url === "/api/analyze" && String(body.text || "").trim() === window.SAMPLE_TEXT.trim()) {
    const res = await fetch("demo-result.json");
    return res.json();
  }
  throw new Error('This public preview shows the sample text only. Click "Load a sample text", then "Show structure". The live app runs locally with an API key.');
}

function updateCount() {
  const n = words($("text").value);
  $("count").textContent = n ? `${n.toLocaleString()} words` : "";
}

$("text").addEventListener("input", updateCount);
$("sample").addEventListener("click", () => {
  $("text").value = window.SAMPLE_TEXT;
  updateCount();
  setStatus("");
});

$("fetchBtn").addEventListener("click", async () => {
  const url = $("url").value.trim();
  if (!url) return setStatus("Add a link first.", true);
  $("fetchBtn").disabled = true;
  setStatus("Getting the article...");
  try {
    const { text } = await post("/api/fetch", { url });
    $("text").value = text;
    updateCount();
    setStatus("Text loaded. Check it, then press Show me the structure.");
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    $("fetchBtn").disabled = false;
  }
});

$("go").addEventListener("click", async () => {
  const text = $("text").value.trim();
  if (words(text) < 30) return setStatus("Paste a longer text first (at least 30 words).", true);
  $("go").disabled = true;
  setStatus("Reading the structure. This takes up to a minute for a long text...");
  try {
    data = await post("/api/analyze", { text });
    view = "structured";
    show();
    setStatus("");
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    $("go").disabled = false;
  }
});

$("newText").addEventListener("click", () => {
  $("readScreen").hidden = true;
  $("topActions").hidden = true;
  $("inputScreen").hidden = false;
  window.scrollTo(0, 0);
});
$("viewStructured").addEventListener("click", () => setView("structured"));
$("viewOriginal").addEventListener("click", () => setView("original"));
$("viewBrief").addEventListener("click", () => setView("brief"));

// Brief view keeps only the sentences that carry the structure of the text.
const BRIEF_GROUPS = new Set(["contrast", "concession", "result", "summary", "emphasis", "sequence", "alternative"]);

function setView(v) {
  view = v;
  $("viewStructured").classList.toggle("on", v === "structured");
  $("viewBrief").classList.toggle("on", v === "brief");
  $("viewOriginal").classList.toggle("on", v === "original");
  renderBody();
}

function show() {
  $("inputScreen").hidden = true;
  $("readScreen").hidden = false;
  $("topActions").hidden = false;
  $("viewStructured").classList.add("on");
  $("viewOriginal").classList.remove("on");
  $("viewBrief").classList.remove("on");
  renderCover();
  renderBody();
  renderLegend();
  window.scrollTo(0, 0);
}

// ---------- Cover: the map before the text ----------

function partWordCounts() {
  const perSentence = new Map();
  data.paragraphs.forEach((p) => p.sentences.forEach((s) => perSentence.set(s.id, words(s.text))));
  return data.overview.parts.map((part) => {
    let n = 0;
    for (let id = part.start; id <= part.end; id++) n += perSentence.get(id) || 0;
    return n;
  });
}

function renderCover() {
  const c = $("cover");
  c.replaceChildren();
  c.append(el("h2", null, "Before you read"));

  const stats = el("div", "stats");
  const stat = (num, cap) => {
    const s = el("div", "stat");
    s.append(el("div", "num", num.toLocaleString()), el("div", "cap", cap));
    return s;
  };
  stats.append(stat(data.stats.words, "words ahead"), stat(data.overview.parts.length, "parts"), stat(data.annotations.length, "connecting words marked"));
  c.append(stats);

  c.append(el("p", "gist", data.overview.gist));

  const counts = partWordCounts();
  const stripe = el("div", "stripe");
  data.overview.parts.forEach((part, i) => {
    const seg = el("span", "t-" + part.type);
    seg.style.flex = `${Math.max(counts[i], 1)} 1 0`;
    seg.title = `${PART_NAMES[part.type]}: ${part.label}`;
    stripe.append(seg);
  });
  c.append(stripe);

  const list = el("ol", "parts");
  data.overview.parts.forEach((part, i) => {
    const li = el("li");
    const b = el("button", "part-link");
    b.type = "button";
    b.append(el("span", "sw t-" + part.type), el("span", "no", String(i + 1)), el("span", "ty", PART_NAMES[part.type]), el("span", "lb", part.label), el("span", "wc", `${counts[i]} words`));
    b.addEventListener("click", () => {
      if (view === "original") setView("structured");
      document.getElementById("part-" + (i + 1))?.scrollIntoView();
    });
    li.append(b);
    list.append(li);
  });
  c.append(list);
  c.append(el("p", "note", "This map was written by an AI model. The text below is the original, word for word."));
}

// ---------- Body ----------

function chip(text, group) {
  const g = GROUPS[group];
  const c = el("span", "cw g-" + group);
  c.title = `${g.name}: ${g.says}`;
  c.append(el("span", "sym", g.sym), document.createTextNode(text));
  return c;
}

// Append sentence text [from, to) to node, turning marked connectors into chips.
function appendText(node, sentence, from, to, marks) {
  let cursor = from;
  for (const m of marks.filter((m) => m.sentence === sentence.id && m.pos >= from && m.end <= to).sort((a, b) => a.pos - b.pos)) {
    if (m.pos < cursor) continue;
    if (m.pos > cursor) node.append(sentence.text.slice(cursor, m.pos));
    node.append(chip(sentence.text.slice(m.pos, m.end), m.group));
    cursor = m.end;
  }
  if (cursor < to) node.append(sentence.text.slice(cursor, to));
}

function appendSentences(node, sentences, marks) {
  for (const s of sentences) appendText(node, s, 0, s.text.length, marks);
}

let stepNo = 0;

function renderParagraph(p, container) {
  const byId = new Map(p.sentences.map((s) => [s.id, s]));
  const first = p.sentences[0].id;
  const last = p.sentences.at(-1).id;
  const anns = data.annotations
    .filter((a) => byId.has(a.sentence))
    .sort((a, b) => a.sentence - b.sentence || a.pos - b.pos);

  const claimed = new Map(); // sentence id -> block
  const marks = [];
  const blocks = [];

  for (const a of anns) {
    if (a.layout === "mark") { marks.push(a); continue; }
    let from = a.layout === "pair" ? a.before_start : a.sentence;
    const to = a.after_end;
    if (a.layout === "pair" && from === a.sentence) {
      // No real "before" side inside the sentence: use the previous sentence, or just mark.
      const before = byId.get(a.sentence).text.slice(0, a.pos);
      if (words(before) < 3) {
        if (a.sentence - 1 >= first) from = a.sentence - 1;
        else { marks.push(a); continue; }
      }
    }
    if (a.layout === "pair" && words(tail(a, byId, to)) < 3) { marks.push(a); continue; }
    let free = true;
    for (let id = from; id <= to; id++) if (claimed.has(id)) free = false;
    if (!free) { marks.push(a); continue; }
    const block = { a, from, to };
    for (let id = from; id <= to; id++) claimed.set(id, block);
    blocks.push(block);
    if (a.layout !== "pair") marks.push(a); // connector stays inline inside the block
  }

  let run = null;
  let steps = null;
  for (let id = first; id <= last; id++) {
    const block = claimed.get(id);
    if (!block) {
      steps = null;
      if (view === "brief" && !marks.some((m) => m.sentence === id && BRIEF_GROUPS.has(m.group))) { run = null; continue; }
      if (!run) { run = el("p", "run"); container.append(run); }
      appendSentences(run, [byId.get(id)], marks);
      continue;
    }
    run = null;
    if (block.from !== id) continue;
    const sentences = [];
    for (let i = block.from; i <= block.to; i++) sentences.push(byId.get(i));
    const a = block.a;

    if (a.layout === "sequence") {
      if (!steps) { steps = el("ol", "steps"); container.append(steps); }
      const word = byId.get(a.sentence).text.slice(a.pos, a.end);
      if (/^(first|firstly|first of all|to begin with)$/i.test(word) || stepNo === 0) stepNo = 1;
      else stepNo++;
      const li = el("li", "step");
      const tx = el("div", "tx");
      appendSentences(tx, sentences, marks);
      li.append(el("div", "n", String(stepNo)), tx);
      steps.append(li);
      continue;
    }
    steps = null;

    if (a.layout === "pair") container.append(renderPair(block, byId, marks));
    else if (a.layout === "example") {
      if (view === "brief") continue;
      const d = el("details", "example");
      d.open = true;
      d.append(el("summary", null, "( )  Example"));
      const tx = el("div", "tx");
      appendSentences(tx, sentences, marks);
      d.append(tx);
      container.append(d);
    } else {
      const b = el("div", "blk summary-blk");
      b.append(el("div", "blk-label", a.group === "summary" ? "Σ  Summary" : "∴  Conclusion"));
      const tx = el("div", "tx");
      appendSentences(tx, sentences, marks);
      b.append(tx);
      container.append(b);
    }
  }
}

function tail(a, byId, to) {
  let t = byId.get(a.sentence).text.slice(a.end);
  for (let i = a.sentence + 1; i <= to; i++) t += byId.get(i).text;
  return t;
}

function renderPair(block, byId, marks) {
  const { a, from, to } = block;
  const s = byId.get(a.sentence);
  const wrap = el("div", "blk pair" + (a.group === "alternative" ? "" : " weighted"));

  const sideA = el("div", "side a");
  sideA.append(el("div", "blk-label", a.group === "alternative" ? "Option A" : a.group === "concession" ? "Admitted" : "Side A"));
  const ta = el("div", "tx");
  for (let i = from; i < a.sentence; i++) appendSentences(ta, [byId.get(i)], marks);
  appendText(ta, s, 0, a.pos, marks);
  sideA.append(ta);

  const mid = el("div", "mid");
  const pill = el("div", "pill");
  pill.title = `${GROUPS[a.group].name}: ${GROUPS[a.group].says}`;
  pill.append(el("span", "sym", GROUPS[a.group].sym), document.createTextNode(s.text.slice(a.pos, a.end)));
  mid.append(pill);

  const sideB = el("div", "side b");
  sideB.append(el("div", "blk-label", a.group === "alternative" ? "Option B" : a.group === "concession" ? "Claimed" : "Side B"));
  const tb = el("div", "tx");
  // Skip the comma and space that follow the connector; every other character is kept.
  let start = a.end;
  while (start < s.text.length && /[,\s]/.test(s.text[start])) start++;
  appendText(tb, s, start, s.text.length, marks);
  for (let i = a.sentence + 1; i <= to; i++) appendSentences(tb, [byId.get(i)], marks);
  sideB.append(tb);

  wrap.append(sideA, mid, sideB);
  return wrap;
}

function renderBody() {
  const body = $("body");
  body.replaceChildren();
  if (view === "original") {
    const plain = el("div", "plain");
    for (const p of data.paragraphs) plain.append(el("p", null, p.sentences.map((s) => s.text).join("")));
    body.append(plain);
    return;
  }
  stepNo = 0;
  if (view === "brief") body.append(el("p", "brief-note", "Brief: only the sentences that carry the structure, such as the main turns, the steps and the conclusions. Original words, nothing rewritten. Examples and details are in the Structured view."));
  const parts = data.overview.parts;
  let next = 0;
  for (const p of data.paragraphs) {
    const lastId = p.sentences.at(-1).id;
    while (next < parts.length && parts[next].start <= lastId) {
      const h = el("div", "part-head");
      h.id = "part-" + (next + 1);
      h.append(el("span", "no", `Part ${next + 1}`), el("span", "ty", PART_NAMES[parts[next].type]), el("span", "lb", parts[next].label));
      body.append(h);
      next++;
    }
    renderParagraph(p, body);
  }
}

// /?demo loads the sample text and runs it. /?url=<link> loads that article and runs it.
const params = new URLSearchParams(location.search);
if (params.has("demo")) {
  $("text").value = window.SAMPLE_TEXT;
  updateCount();
  $("go").click();
} else if (params.get("url")) {
  $("url").value = params.get("url");
  setStatus("Getting the article...");
  post("/api/fetch", { url: params.get("url") })
    .then(({ text }) => {
      $("text").value = text;
      updateCount();
      $("go").click();
    })
    .catch((e) => setStatus(e.message, true));
}

function renderLegend() {
  const box = $("legend");
  box.replaceChildren();
  box.append(el("h3", null, "Symbols in this text"));
  const used = [...new Set(data.annotations.map((a) => a.group))];
  const dl = el("dl");
  for (const key of Object.keys(GROUPS).filter((k) => used.includes(k))) {
    const row = el("div", "row");
    const dd = el("dd");
    dd.append(el("b", null, GROUPS[key].name), document.createTextNode(GROUPS[key].says));
    row.append(el("dt", null, GROUPS[key].sym), dd);
    dl.append(row);
  }
  box.append(dl);
  if (data.dropped) box.append(el("p", "dropped", `${data.dropped} marking(s) did not match the original text and were left out.`));
}
