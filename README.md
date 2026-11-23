# The Whole Text

Built at Fable 5.2 Build Day, Tel Aviv, 23 November 2026. Topic: accessibility. Lane: Productive.

**See it:** https://salteddana.github.io/the-whole-text/?demo

Some texts cannot be skipped or summarized: a contract, an academic paper, a report you are expected to know. For readers with attention difficulties, a long wall of text is hard to stay with.

The Whole Text gives access to the full text. Nothing is summarized and nothing is rewritten. The reader gets every original word, in a shape that is easier to stay with.

## How it works

1. You paste a long text, or a link to an article.
2. The app splits it into numbered sentences.
3. Fable 5.2 reads the text and returns only pointers: where each connecting word sits, what job it does in that sentence, and which sentences belong to each side.
4. The server checks every pointer against the original text and drops any that do not match.
5. The page shows the original words in that structure. "However" puts two sides face to face. "Or" puts options side by side. "First, second, finally" turns into numbered steps. "In conclusion" gets a large block.
6. Before the text, a short map shows the length and what is inside: a story, an example, the main point, a summary. The map is written by the model and is labeled as such. The text itself is the original, word for word.

The connecting words follow 17 groups (contrast, concession, cause, result, condition, and more), based on signal-word classifications by text structure.

## Run it

```bash
pnpm install
```

```bash
export ANTHROPIC_API_KEY="your key"
```

```bash
node server.js
```

Then open http://localhost:4319. The key is read from the environment and never reaches the browser. The server listens on your own computer only.

## The public preview

The link at the top is a static copy in `docs/`. It has no server and no API key, so it shows a saved result for the sample text only. The live app, with any text, runs locally.
