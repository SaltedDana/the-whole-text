#!/usr/bin/env python3
"""Connecting Words Reader: local server. Reads ANTHROPIC_API_KEY from the environment only."""
import json, os, re, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "claude-fable-5-2"
PORT = 8765

SYSTEM = """You structure a text for readers with attention difficulties. You never rewrite text.
You receive numbered sentences. Return ONLY JSON (no prose, no code fence) with this shape:
{"sections":[{"label":"Background|Story|Example|Argument|Main point|Summary","from":1,"to":3}],
 "main_point":<id of the sentence that carries the writer's main claim>,
 "blocks":[{"type":"<type>","connector":"<exact connecting word(s) as they appear in the text>","parts":[[ids],[ids]]}]}

Block types, chosen by the connecting words and the logic they signal:
- contrast: but, however, yet, whereas, in contrast, on the other hand. parts = [side A ids],[side B ids]
- concession: although, despite, nevertheless, that said. parts = [what the writer admits],[what the writer claims]
- option: or, either/or, alternatively, otherwise. parts = one part per option
- condition: if, unless, provided that. parts = [condition],[outcome]
- cause: because, since, due to. parts = [what happened],[the reason]
- result: therefore, thus, so, as a result. parts = [what was said],[what follows from it]
- similarity: similarly, likewise, just as. parts = [case A],[case B]
- sequence: first, second, then, next, finally. parts = one part per step, in order
- example: for example, for instance, such as. parts = [[example ids]]
- emphasis: indeed, in fact, above all, most importantly. parts = [[ids]]
- summary: in conclusion, to sum up, overall, in short, ultimately. parts = [[ids]]
- plain: no structure. parts = [[ids]]

Rules:
1. Every sentence id appears exactly once, in original order across blocks.
2. Only mark connectors that change direction or flag an important point. Most sentences stay plain. Too much marking makes the page unreadable.
3. Words with two jobs (since, as, while, so, like, still, yet, once, for): decide by context. "since 2020" is time, not cause. "while" can be time or contrast.
4. When both sides of a relation sit inside one sentence, use that single sentence as one part.
5. "connector" must be copied exactly from the text so it can be highlighted.
6. sections cover all ids from 1 to the last, without overlap."""


def call_model(sentences):
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in this terminal")
    numbered = "\n".join(f"[{i+1}] {s}" for i, s in enumerate(sentences))
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 16000,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": numbered}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.loads(r.read())
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise RuntimeError("model returned no JSON")
    return json.loads(m.group(0))


class H(BaseHTTPRequestHandler):
    def _send(self, code, payload, ctype="application/json"):
        raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as f:
                self._send(200, f.read(), "text/html; charset=utf-8")
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/structure":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            sentences = json.loads(self.rfile.read(n)).get("sentences", [])
            if not sentences or len(sentences) > 2000:
                return self._send(400, {"error": "need 1 to 2000 sentences"})
            self._send(200, {"structure": call_model([str(s) for s in sentences]), "model": MODEL})
        except urllib.error.HTTPError as e:
            self._send(502, {"error": f"API {e.code}: {e.read().decode(errors='replace')[:300]}"})
        except Exception as e:
            self._send(500, {"error": str(e)})

    def log_message(self, fmt, *args):
        print("  " + fmt % args)


if __name__ == "__main__":
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    print(f"Connecting Words Reader: http://localhost:{PORT}")
    print(f"Model: {MODEL} | API key: {'found' if has_key else 'MISSING (app falls back to local rules)'}")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
