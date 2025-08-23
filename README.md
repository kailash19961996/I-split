# Intelligent Regulation Splitter (iSplit)

A lightweight tool that ingests a regulation document (PDF for now) and breaks it into a strict JSON structure (title → articles → items), with a side-by-side PDF/JSON view and automatic validation highlights.

**AI angle (short overview):**
The app uses LLM passes to: (1) detect headings, (2) split bodies into items, and (3) infer hierarchical “paths” (e.g., Chapter/Part). We keep the original text intact (no rephrasing). The “Ask AI” button is currently a placeholder you can wire to an agent that suggests fixes for blocks that don’t match the PDF. &#x20;


[![Watch the demo](https://img.youtube.com/vi/GVj4KfyxKZA/hqdefault.jpg)](https://www.youtube.com/watch?v=GVj4KfyxKZA)

---

## What you get

* **Split view:** PDF on the left, JSON editor on the right.&#x20;
* **LLM pipeline buttons:** LLM Pass 1 → Splitter 1 → LLM Pass 2 → LLM Pass 3.&#x20;
* **Real-time validation:** JSON values are highlighted against the real PDF text (green = found, red = not found). Matching uses a 6-word block strategy with a 5-word sliding window.&#x20;
* **PDF text extraction in browser:** We extract the full PDF text client-side (react-pdf) and normalize spacing to improve matching.&#x20;

---

## Quick start (local)

### 1) Backend (Python, Flask)

```bash
# from repo root
cd backend   # or the folder where main.py lives
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install flask flask-cors pypdf python-dotenv openai
```

Create a `.env` file next to `utils.py`:

```bash
# .env
OPENAI_API_KEY=your_api_key_here
# optional: override defaults
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_MODEL1=gpt-4o-mini
```

Run the API:

```bash
python main.py
```

The API listens on `http://localhost:5000`.&#x20;
Environment variables and default model names are read in `utils.py`.&#x20;

### 2) Frontend (React + Vite)

```bash
# from repo root
cd frontend   # or the folder where App.jsx lives
npm install
npm run dev
```

Open `http://localhost:3000`, upload a PDF, set the TOC page start/end, then click the buttons in order. The frontend calls `/api/*` on the Flask backend.&#x20;

---

## How it works (the pipeline)

1. **LLM Pass 1 – Headings**
   Uploads the PDF (multipart), reads the Table-of-Contents range, and returns a skeleton JSON with document title/url and top-level article headings (content/items/path empty). Endpoint: `POST /api/llm-pass-1`. &#x20;

2. **Splitter 1 – Verbatim content**
   Reads the body from `(TOC end + 1)` to the end of the PDF and slices each article’s **verbatim** content between headings. Endpoint: `POST /api/splitter-1`. &#x20;

3. **LLM Pass 2 – Items**
   Splits each article content into items (using explicit markers when present; falls back to conservative splitting). Endpoint: `POST /api/llm-pass-2`. &#x20;

4. **LLM Pass 3 – Path (hierarchy)**
   Infers the hierarchical path (e.g., Chapter/Part/Title) for each article. Endpoint: `POST /api/llm-pass-3`. &#x20;

**Validation UI:**
The JSON editor computes found/not-found blocks by normalizing text and checking against the PDF text (with sliding windows and per-word highlights). A percent badge shows how much is “green”.&#x20;

---

## API (quick reference)

* `POST /api/llm-pass-1`
  **Form-data:** `pdf` (file), `index_page_start` (int), `index_page_end` (int). Saves the PDF server-side and runs Pass 1.&#x20;

* `POST /api/splitter-1`
  **JSON:** `{ json_data? }` (optional; uses last state if omitted). Slices verbatim content between headings across the PDF body.&#x20;

* `POST /api/llm-pass-2`
  **JSON:** `{ json_data? }`. Extracts items for each article.&#x20;

* `POST /api/llm-pass-3`
  **JSON:** `{ json_data? }`. Extracts hierarchical `path` for each article.&#x20;

* `POST /api/ask-ai` *(placeholder)*
  **JSON:** `{ snippet, path }`. Returns a canned suggestion for now — wire this to your agent later.&#x20;

* `GET /api/health` → `{"status":"healthy"}`.&#x20;

---

## Code tour (files)

* **backend/main.py** – Flask app + endpoints, simple in-memory state, file upload handling.&#x20;
* **backend/utils.py** – PDF text extraction, JSON-only prompts, OpenAI callers, content splitter, itemization, and path extraction helpers. Reads `OPENAI_API_KEY` and model names from `.env`.&#x20;
* **frontend/src/App.jsx** – UI shell, buttons to trigger each pass, manages pipeline state and sends JSON to backend when needed.&#x20;
* **frontend/src/components/JSONEditor.jsx** – React-Ace editor, heavy normalization, sentence/word-level highlighting, 6-word blocks + 5-word sliding window matching, and an “Ask AI” button trigger.&#x20;
* **frontend/src/components/PDFViewer.jsx** – react-pdf viewer, page controls, and whole-document text extraction with position-aware line handling.&#x20;
* **README.md** *(this file)* – high-level usage and setup.&#x20;

> Note: The hackathon brief this project targets is the “Intelligent Regulation Splitter” bounty: multi-level legal text, verbatim preservation, cross-jurisdiction formats, and human-in-the-loop.&#x20;

---

## Environment

* Python 3.9+ (tested with Flask + Flask-CORS)
* Node 18+ (Vite dev server)
* OpenAI API key in `.env` next to `utils.py` (`OPENAI_API_KEY`, optional `OPENAI_MODEL`, `OPENAI_MODEL1`).&#x20;

---

## Future scope (next steps)

* **“Ask AI” agent:** Send the exact PDF region + the failing (red) block + its JSON path to an agent that proposes a fix. Apply suggestions back into the JSON, then re-validate.&#x20;
* **Auto-fix loop + checklist:** Repeat until all blocks go green; keep a human confirmation step before finalizing. (Today the button is a stub.)&#x20;
* **Two-way verification:** We currently validate right-to-left (JSON → PDF). Add the left-to-right pass (PDF → JSON coverage) so nothing is missed.&#x20;
* **More formats:** Add HTML/docx ingestion. Either convert to PDF first or parse HTML directly while preserving structure and links.
* **URL ingestion / crawling, OCR, multi-language:** Useful for broader coverage (per the bounty brief).&#x20;

---

## Contributing

Small PRs welcome (typo fixes, better prompts, smarter normalization rules). Keep code comments and user-facing text generic so teams can reuse this beyond the hackathon.
