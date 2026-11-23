# The Whole Text

Built at Fable 5.2 Build Day, Tel Aviv, 23 November 2026. Topic: accessibility. Lane: Productive.

Some texts cannot be skipped or summarized: a contract, an academic paper, a report you are expected to know. For readers with attention difficulties, a long wall of text is hard to stay with.

The Whole Text gives access to the full text. Nothing is summarized and nothing is rewritten. The reader gets every original word, in a shape that is easier to stay with.

## How it works

1. You paste a long text.
2. The app splits it into numbered sentences.
3. Fable 5.2 reads the whole text and returns only a structure: which sentences belong together, and which connecting word joins them.
4. The page shows the original sentences in that structure. "However" puts two sides face to face. "Or" puts options side by side. "First, second, finally" turns into numbered steps. "In conclusion" gets a large, bold block.
5. Before the text, a short map shows the length, the reading time and what is inside.

The model never returns text, only sentence numbers. The page then makes sure that every sentence appears exactly once and in the original order.

## Run it

```bash
export ANTHROPIC_API_KEY="your key"
python3 server.py
```

Then open http://localhost:8765. No dependencies. The key is read from the environment and never reaches the browser.

Without a key, or on the GitHub Pages preview, the page falls back to a small set of local rules and says so on screen.
