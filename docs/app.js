// Connecting Words Reader. Renders the ORIGINAL text from the server's sentence list
// plus verified annotations. Text is always inserted with textContent, never as HTML.
// 8 reader-facing types, one fixed color each (spec: research/product-logic.md section 3).

const TYPES = {
  turn: { sym: "⇄", name: "Turn", says: "The text turns, admits a point, or offers an alternative" },
  reasoning: { sym: "∴", name: "Reasoning", says: "Why, on what condition, or what follows" },
  addition: { sym: "+", name: "Addition", says: "One more point, same direction" },
  sequence: { sym: "№", name: "Sequence", says: "What comes first, next, last" },
  example: { sym: "( )", name: "Example", says: "Here is a specific case" },
  guide: { sym: "§", name: "Guide", says: "Same idea in other words, or the topic moves" },
  summary: { sym: "Σ", name: "Summary", says: "The bottom line" },
  voice: { sym: "“ ”", name: "Voice", says: "Whose voice, and how sure" },
};
const TYPE_ORDER = Object.keys(TYPES);
const UNDERLINE = { turn: "solid", reasoning: "dashed", addition: "wavy", sequence: "solid", example: "wavy", guide: "dotted", summary: "double", voice: "dotted" };
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
let showAll = false;
let linkLetters = new Map();

function setStatus(msg, isError) {
  $("status").textContent = msg || "";
  $("status").classList.toggle("error", !!isError);
}

async function loadDemo(id) {
  setStatus("Loading...");
  try {
    const res = await fetch("data/" + id + ".json");
    if (!res.ok) throw new Error("Could not load this example.");
    data = await res.json();
    view = "structured";
    show();
    setStatus("");
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function buildPicker() {
  const list = $("examples");
  try {
    const items = await (await fetch("data/index.json")).json();
    for (const it of items) {
      const b = el("button", "example-card");
      b.type = "button";
      b.append(el("span", "ex-kind", it.kind), el("span", "ex-title", it.title), el("span", "ex-words", it.words + " words"));
      b.addEventListener("click", () => loadDemo(it.id));
      list.append(b);
    }
    const q = new URLSearchParams(location.search).get("text");
    if (q && items.some((i) => i.id === q)) loadDemo(q);
  } catch (e) {
    setStatus("Could not load the examples.", true);
  }
}
buildPicker();

$("newText").addEventListener("click", () => {
  $("readScreen").hidden = true;
  $("topActions").hidden = true;
  $("inputScreen").hidden = false;
  window.scrollTo(0, 0);
});
$("viewStructured").addEventListener("click", () => setView("structured"));
$("viewOriginal").addEventListener("click", () => setView("original"));
$("viewBrief").addEventListener("click", () => setView("brief"));
$("showAll").addEventListener("click", () => {
  showAll = !showAll;
  $("showAll").classList.toggle("on", showAll);
  $("showAll").setAttribute("aria-pressed", String(showAll));
  renderBody();
});

// Brief view keeps only the sentences that carry the structure of the text.
const BRIEF_KINDS = new Set(["contrast", "concession", "result", "summary", "stance", "sequence", "alternative"]);

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
  linkLetters = new Map();
  for (const a of data.annotations) if (a.link && !linkLetters.has(a.link)) linkLetters.set(a.link, String.fromCharCode(97 + (linkLetters.size % 26)));
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
  stats.append(stat(data.stats.words, "words ahead"), stat(data.overview.parts.length, "parts"), stat(data.paragraphs.length, "paragraphs"));
  c.append(stats);

  c.append(el("p", "gist", data.overview.gist));

  const counts = partWordCounts();
  const stripe = el("div", "stripe");
  data.overview.parts.forEach((part, i) => {
    const seg = el("span", "pt-" + part.type);
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
    b.append(el("span", "sw pt-" + part.type), el("span", "no", String(i + 1)), el("span", "ty", PART_NAMES[part.type]), el("span", "lb", part.label), el("span", "wc", `${counts[i]} words`));
    b.addEventListener("click", () => {
      if (view === "original") setView("structured");
      document.getElementById("part-" + (i + 1))?.scrollIntoView();
    });
    li.append(b);
    list.append(li);
  });
  c.append(list);
  c.append(el("p", "note", "Green labels and this green-edged box are added by the reader. Everything else is the original text, word for word."));
}

// ---------- Body ----------

function chip(text, a) {
  const t = TYPES[a.type];
  const c = el("span", "cw t-" + a.type + (a.link ? " linked" : ""));
  c.title = `${t.name}: ${t.says}`;
  const sym = el("span", "sym", t.sym);
  sym.setAttribute("aria-hidden", "true");
  if (a.link) { c.dataset.link = a.link; sym.append(el("sup", "idx", linkLetters.get(a.link) || "")); }
  c.append(sym, document.createTextNode(text));
  return c;
}

const isShown = (a) => a.visible !== false || showAll;

// Append sentence text [from, to) to node, turning visible marks into chips.
function appendText(node, sentence, from, to, marks) {
  let cursor = from;
  for (const m of marks.filter((m) => m.sentence === sentence.id && m.pos >= from && m.end <= to).sort((a, b) => a.pos - b.pos)) {
    if (m.pos < cursor) continue;
    if (m.pos > cursor) node.append(sentence.text.slice(cursor, m.pos));
    node.append(chip(sentence.text.slice(m.pos, m.end), m));
    cursor = m.end;
  }
  if (cursor < to) node.append(sentence.text.slice(cursor, to));
}

function appendSentences(node, sentences, marks) {
  for (const s of sentences) appendText(node, s, 0, s.text.length, marks);
}

function renderParagraph(p, container) {
  const byId = new Map(p.sentences.map((s) => [s.id, s]));
  const first = p.sentences[0].id;
  const last = p.sentences.at(-1).id;
  const anns = data.annotations.filter((a) => byId.has(a.sentence)).sort((a, b) => a.sentence - b.sentence || a.pos - b.pos);

  const claimed = new Map(); // sentence id -> annotation that owns the block
  const marks = [];
  for (const a of anns) {
    if (a.layout === "mark") { if (isShown(a)) marks.push(a); continue; }
    for (let id = a.before_start; id <= a.after_end; id++) claimed.set(id, a);
    if (a.layout !== "pair") marks.push(a); // the connector stays inline inside its block
  }

  let run = null;
  let steps = null;
  for (let id = first; id <= last; id++) {
    const a = claimed.get(id);
    if (!a) {
      steps = null;
      if (view === "brief" && !anns.some((m) => m.sentence === id && BRIEF_KINDS.has(m.kind))) { run = null; continue; }
      if (!run) { run = el("p", "run"); container.append(run); }
      appendSentences(run, [byId.get(id)], marks);
      continue;
    }
    run = null;
    if (a.before_start !== id) continue;
    const sentences = [];
    for (let i = a.before_start; i <= a.after_end; i++) sentences.push(byId.get(i));

    if (a.layout === "sequence") {
      if (!steps) { steps = el("ol", "steps"); container.append(steps); }
      const li = el("li", "step");
      const tx = el("div", "tx");
      if (a.list_size) tx.append(el("div", "step-label", `Step ${a.number} of ${a.list_size}`));
      appendSentences(tx, sentences, marks);
      li.append(el("div", "n", String(a.number)), tx);
      steps.append(li);
      continue;
    }
    steps = null;

    if (a.layout === "pair") container.append(renderPair(a, byId, marks));
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
      const conclusion = a.label === "Conclusion";
      const b = el("div", "blk summary-blk " + (conclusion ? "t-reasoning-blk" : "t-summary-blk"));
      b.append(el("div", "blk-label", conclusion ? "∴  Conclusion" : "Σ  Summary"));
      const tx = el("div", "tx");
      appendSentences(tx, sentences, marks);
      b.append(tx);
      container.append(b);
    }
  }
}

function renderPair(a, byId, marks) {
  const s = byId.get(a.sentence);
  const labels = a.kind === "alternative" ? ["Option A", "Option B"] : a.kind === "concession" ? ["Admitted", "Claimed"] : ["Side A", "Side B"];
  const wrap = el("div", "blk pair" + (a.kind === "alternative" ? "" : " weighted"));

  const sideA = el("div", "side a");
  sideA.append(el("div", "blk-label", labels[0]));
  const ta = el("div", "tx");
  const sideB = el("div", "side b");
  sideB.append(el("div", "blk-label", labels[1]));
  const tb = el("div", "tx");

  const skipSep = (from) => { let i = from; while (i < s.text.length && /[,\s]/.test(s.text[i])) i++; return i; };
  if (a.pair_class === "C") {
    // Side A runs from the connector to the first top-level comma; side B follows it. Every character is kept except the comma.
    appendText(ta, s, a.end, a.split, marks);
    appendText(tb, s, skipSep(a.split), s.text.length, marks);
  } else {
    for (let i = a.before_start; i < a.sentence; i++) appendSentences(ta, [byId.get(i)], marks);
    appendText(ta, s, 0, a.pos, marks);
    appendText(tb, s, skipSep(a.end), s.text.length, marks);
  }
  sideA.append(ta);
  sideB.append(tb);

  const mid = el("div", "mid");
  const pill = el("div", "pill t-turn");
  pill.title = `${TYPES.turn.name}: ${TYPES.turn.says}`;
  pill.append(el("span", "sym", TYPES.turn.sym), document.createTextNode(s.text.slice(a.pos, a.end)));
  mid.append(pill);

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
  if (data.structure_ok === false) body.append(el("p", "brief-note", "Structure could not be shown for this text. Showing the original."));
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

// Hover or focus on one half of a linked pair highlights the other half.
document.addEventListener("mouseover", (e) => toggleLink(e.target, true));
document.addEventListener("mouseout", (e) => toggleLink(e.target, false));
function toggleLink(target, on) {
  const c = target.closest?.(".cw[data-link]");
  if (!c) return;
  document.querySelectorAll(`.cw[data-link="${c.dataset.link}"]`).forEach((n) => n.classList.toggle("hl", on));
}

function renderLegend() {
  const box = $("legend");
  box.replaceChildren();
  box.append(el("h3", null, "Types in this text"));
  const used = new Set(data.annotations.map((a) => a.type));
  const dl = el("dl");
  for (const key of TYPE_ORDER.filter((k) => used.has(k))) {
    const row = el("div", "row");
    const dd = el("dd");
    const name = el("b", "t-" + key, TYPES[key].name);
    name.classList.add("ul-" + UNDERLINE[key]);
    dd.append(name, document.createTextNode(TYPES[key].says));
    const dt = el("dt", "t-" + key, TYPES[key].sym);
    row.append(dt, dd);
    dl.append(row);
  }
  box.append(dl);
  const hidden = data.annotations.filter((a) => a.visible === false).length;
  if (hidden) box.append(el("p", "dropped", `${hidden} less important mark(s) are hidden. Press "Show all" to see them.`));
  const flagged = (data.checks || []).filter((c) => c.action === "fail").length;
  if (flagged) box.append(el("p", "dropped", "A self-check stopped the markup for this text."));
}
