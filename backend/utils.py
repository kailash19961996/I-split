# pip install openai python-dotenv pypdf

import os
import json
import re
from typing import Optional, Tuple, List
from datetime import datetime

from pypdf import PdfReader
from dotenv import load_dotenv
from openai import OpenAI
from io import BytesIO
from io import IOBase

# ----------------------------
# Env & client
# ----------------------------
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_MODEL1 = os.getenv("OPENAI_MODEL1", "gpt-4o-mini")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY missing. Add it to your .env")

client = OpenAI(api_key=OPENAI_API_KEY)


# ----------------------------
# PDF Extraction Helpers
# ----------------------------

def _open_pdf_reader(pdf_source: object) -> PdfReader:
    """Return a PdfReader from a path, bytes, or file-like object.

    Accepts:
    - str path
    - bytes/bytearray
    - file-like object with .read()
    """
    if isinstance(pdf_source, (bytes, bytearray)):
        return PdfReader(BytesIO(pdf_source))
    if isinstance(pdf_source, IOBase) or hasattr(pdf_source, "read"):
        return PdfReader(pdf_source)
    # assume string-like path
    return PdfReader(pdf_source)  # type: ignore[arg-type]

def extract_pdf_text(
    pdf_source: object,
    index_pages: Optional[Tuple[int, int]] = None,
    max_chars: int = 128000,
) -> str:
    """Extract text from a PDF (path, bytes, or file-like)."""
    reader = _open_pdf_reader(pdf_source)
    n = len(reader.pages)

    if index_pages:
        start, end = index_pages
        start = max(1, start)
        end = min(n, end)
        page_indices: List[int] = list(range(start - 1, end))
    else:
        page_indices = list(range(min(n, 5)))

    chunks: List[str] = []
    for i in page_indices:
        text = reader.pages[i].extract_text() or ""
        chunks.append(text)

    merged = "\n".join(chunks).strip()
    return merged[:max_chars]


def extract_pdf_text_range(
    pdf_source: object,
    start_page_1based: int,
    end_page_1based: Optional[int] = None,
) -> str:
    """Concatenate text from start_page_1based..end_page_1based (inclusive)."""
    reader = _open_pdf_reader(pdf_source)
    total = len(reader.pages)
    s = max(1, start_page_1based)
    e = end_page_1based if end_page_1based is not None else total
    e = min(e, total)

    out: List[str] = []
    for i in range(s - 1, e):
        text = reader.pages[i].extract_text() or ""
        out.append(text)
    return "\n".join(out)


# ----------------------------
# JSON Parsing Helpers
# ----------------------------

def _strip_code_fences(s: str) -> str:
    """Removes ```json ... ``` or ``` ... ``` fences if present."""
    s = s.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    return s


def _largest_json_object(s: str) -> str:
    """Extract the substring spanning the largest balanced {...} block."""
    best = (None, None)
    stack = []
    for i, ch in enumerate(s):
        if ch == "{":
            stack.append(i)
        elif ch == "}":
            if stack:
                start = stack.pop()
                if best[0] is None or (i - start) > (best[1] - best[0]):
                    best = (start, i + 1)
    if best[0] is not None:
        return s[best[0]:best[1]]
    return s


def parse_json_strict_or_coerce(content: str) -> dict:
    """Try strict json.loads with fallbacks."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    s = _strip_code_fences(content)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    s2 = _largest_json_object(s)
    try:
        return json.loads(s2)
    except json.JSONDecodeError as e:
        preview = (content[:400] + " ... " + content[-400:]) if len(content) > 900 else content
        raise ValueError(f"Model did not return valid JSON. Preview:\n{preview}") from e


# ----------------------------
# LLM Prompt Builders
# ----------------------------

def build_headings_prompt(pdf_excerpt: str) -> List[dict]:
    """Strict JSON prompt for headings extraction."""
    system = {
        "role": "system",
        "content": (
            "You are a careful parser that returns strict JSON only. "
            "Do NOT include code fences, backticks, or explanations. "
            "Do NOT paraphrase. Preserve all text verbatim as in the document."
        ),
    }

    target_schema = {
        "regulation": {"title": "<document title verbatim>", "url": "<document url if found, otherwise empty string>"},
        "articles": [
            {"title": "<verbatim heading>", "content": "", "items": [], "path": []}
        ],
    }

    user = {
        "role": "user",
        "content": (
            "Extract document information and article headings from this PDF text.\n\n"
            "TASKS:\n"
            "1. Find the main document title (usually at the top, often in caps or bold)\n"
            "2. Look for any URL mentioned in the document\n"
            "3. Extract ONLY the top-level Article/Section headings exactly as written\n"
            "4. Do NOT include article bodies - keep 'content'=\"\", 'items'=[], 'path'=[]\n\n"
            "IMPORTANT: Preserve all text verbatim - do not rephrase or modify anything.\n\n"
            "Return JSON only in this format:\n"
            + json.dumps(target_schema, indent=2, ensure_ascii=False)
            + "\n\nPDF text:\n"
            + pdf_excerpt
        ),
    }
    return [system, user]


def build_items_prompt(article_title: str, article_content: str) -> List[dict]:
    """Build strict-JSON prompt for items extraction."""
    system = {
        "role": "system",
        "content": (
            "You are a careful parser that returns strict JSON only. "
            "Do NOT include code fences, backticks, or explanations. "
            "Preserve the provided text verbatim; do not paraphrase or reflow. "
            "Only remove standalone footer markers such as 'Page N'."
        ),
    }

    target = {
        "items": [
            {"ref": "<identifier>", "content": "<verbatim chunk>"}
        ]
    }

    user = {
        "role": "user",
        "content": (
            "Task: Split the following Article body into items.\n"
            "Rules:\n"
            "- Prefer explicit markers at the start of lines: '1.', '(1)', '(i)', '(a)', '-', '•'.\n"
            "- Each returned item must carry its marker as 'ref' (e.g., '1', '(a)', 'i').\n"
            "- If no markers exist, split conservatively into sentences or paragraph blocks.\n"
            "- Keep text verbatim; do NOT reformat, reflow, or alter punctuation.\n"
            "- Remove standalone lines like 'Page 3' if present.\n"
            "Return JSON only in the shape: \n" + json.dumps(target, indent=2, ensure_ascii=False) + "\n\n"
            f"Article title: {article_title}\n\n"
            f"Article content (verbatim):\n{article_content}"
        ),
    }
    return [system, user]


def build_path_prompt(article_title: str, article_content: str) -> List[dict]:
    """Build strict-JSON prompt for path extraction."""
    system = {
        "role": "system",
        "content": (
            "You are a careful parser that returns strict JSON only. "
            "Do NOT include code fences, backticks, or explanations. "
            "Preserve text verbatim. Look for hierarchical structure in legal documents."
        ),
    }

    target = {"path": ["<higher-level heading>"]}

    instructions = (
        "Extract the hierarchical path for this legal article.\n\n"
        "RULES:\n"
        "1. Look for higher-level headings that contain or precede this article\n"
        "2. Common patterns: 'Chapter I', 'Part 1', 'Title II', 'Section A', '1 Something', '2 Something', etc.\n"
        "3. If the article title itself is a chapter/part/title, include it in path\n"
        "4. If no hierarchical structure found in article content and article title is empty, return empty list [], mostly return a heading if present\n"
        "5. Return verbatim text of headings found\n\n"
        "Examples:\n"
        "- If content shows 'Chapter I - General Provisions' before articles → path: ['Chapter I - General Provisions']\n"
        "- If title is 'Chapter I - General Provisions' → path: ['Chapter I - General Provisions']\n"
        "- If just a regular article with no chapter structure → path: []\n\n"
        "Return JSON only:\n"
        + json.dumps(target, indent=2, ensure_ascii=False)
        + "\n\nArticle title:\n" + (article_title or "")
        + "\n\nArticle content:\n" + (article_content[:1000] + "..." if len(article_content) > 1000 else article_content)
    )

    user = {"role": "user", "content": instructions}
    return [system, user]


# ----------------------------
# OpenAI API Callers
# ----------------------------

def call_openai_for_headings(messages: List[dict]) -> dict:
    """Calls the model with JSON mode."""
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content
    return parse_json_strict_or_coerce(content)


def call_openai_for_items(messages: List[dict]) -> dict:
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content
    return parse_json_strict_or_coerce(content)


def call_openai_for_path(messages: List[dict]) -> dict:
    resp = client.chat.completions.create(
        model=OPENAI_MODEL1,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content
    return parse_json_strict_or_coerce(content)


# ----------------------------
# Content Processing Helpers
# ----------------------------

def build_title_regex(heading: str) -> re.Pattern:
    """Build a flexible regex for a heading that handles OCR errors."""
    tokens = heading.strip().split()
    escaped_tokens = [re.escape(t) for t in tokens if t]
    if not escaped_tokens:
        return re.compile(r"^(?!.*)")

    flexible_tokens = []
    for token in escaped_tokens:
        flexible = token.replace(r'o', r'[o0]').replace(r'i', r'[il1]').replace(r'v', r'[vw]')
        flexible_tokens.append(flexible)

    pattern = r"\s*" + r"\s+".join(flexible_tokens) + r"\s*"
    return re.compile(pattern, flags=re.DOTALL | re.IGNORECASE)


def fill_contents_from_excerpt(
    excerpt_text: str,
    headings_json: dict,
) -> dict:
    """Slice verbatim content directly from the provided excerpt text."""
    text = excerpt_text or ""
    articles = headings_json.get("articles", [])

    # Find start positions of each heading in the excerpt
    starts: List[Optional[int]] = []
    cursor = 0
    for art in articles:
        title = (art.get("title") or "").strip()
        if not title:
            starts.append(None)
            continue
        pat = build_title_regex(title)
        m = pat.search(text, pos=cursor)
        if m:
            starts.append(m.start())
            cursor = m.start()
        else:
            starts.append(None)

    filled_articles: List[dict] = []
    for i, art in enumerate(articles):
        start_idx = starts[i]
        content_text = ""
        if start_idx is not None:
            end_idx = len(text)
            for j in range(i + 1, len(articles)):
                if starts[j] is not None and starts[j] > start_idx:
                    end_idx = starts[j]
                    break
            content_text = text[start_idx:end_idx].rstrip()

        new_art = dict(art)
        new_art["content"] = content_text
        filled_articles.append(new_art)

    result = dict(headings_json)
    result["articles"] = filled_articles
    return result


def fill_contents_from_body(
    pdf_source: object,
    headings_json: dict,
    index_pages: Optional[Tuple[int, int]] = None,
) -> dict:
    """
    Read the PDF body starting at page (TOC end + 1) through the end and
    slice verbatim content between headings found by Pass 1.
    The first heading line itself is removed from the content slice.
    """
    # Determine the page to start scanning body text
    if index_pages and len(index_pages) == 2 and index_pages[1]:
        body_start_page = int(index_pages[1]) + 1
    else:
        body_start_page = 6  # Conservative default if TOC unknown

    body_text = extract_pdf_text_range(
        pdf_source, start_page_1based=body_start_page, end_page_1based=None
    )

    articles = headings_json.get("articles", [])
    compiled: List[Tuple[str, re.Pattern]] = []
    for art in articles:
        title = (art.get("title") or "").strip()
        compiled.append((title, build_title_regex(title)))

    # Locate each heading occurrence in order using a moving cursor
    starts: List[Optional[int]] = []
    cursor = 0
    for title, pat in compiled:
        if not title:
            starts.append(None)
            continue
        m = pat.search(body_text, pos=cursor)
        if m:
            starts.append(m.start())
            cursor = m.start()
        else:
            starts.append(None)

    filled_articles: List[dict] = []
    for i, art in enumerate(articles):
        start_idx = starts[i]
        content_text = ""
        if start_idx is not None:
            end_idx = len(body_text)
            for j in range(i + 1, len(articles)):
                if starts[j] is not None and starts[j] > start_idx:
                    end_idx = starts[j]
                    break

            # Remove heading line itself
            raw_slice = body_text[start_idx:end_idx]
            lines = raw_slice.split('\n')
            if lines:
                content_text = '\n'.join([ln.strip() for ln in lines[1:] if ln.strip()])
            else:
                content_text = raw_slice.strip()

        new_art = dict(art)
        new_art["content"] = content_text
        filled_articles.append(new_art)

    result = dict(headings_json)
    result["articles"] = filled_articles
    return result

def _remove_footers_and_page_numbers(text: str) -> str:
    """Remove common footer artifacts like standalone 'Page 3' lines."""
    lines = text.split('\n')
    cleaned: List[str] = []
    for line in lines:
        stripped = line.strip()
        if re.fullmatch(r"(?i)page\s*\d+", stripped):
            continue
        cleaned.append(line)
    return "\n".join(cleaned)


def split_into_items_verbatim(content: str) -> List[dict]:
    """Split a law-like article body into items preserving verbatim text."""
    if not content:
        return []

    content = _remove_footers_and_page_numbers(content)

    marker_re = re.compile(
        r"(?m)^(?P<marker>" 
        r"\d+\.|"
        r"\(\d+\)|"
        r"\([ivxlcdm]+\)|"
        r"\([a-z]\)|"
        r"\([A-Z]\)|"
        r"[a-z]\)|"
        r"[-•]"
        r")\s+",
        flags=re.IGNORECASE
    )

    matches = list(marker_re.finditer(content))

    if not matches:
        sentence_re = re.compile(r"(?<=\.|\?|!)\s+(?=[A-Z0-9(])")
        parts = [p.strip() for p in sentence_re.split(content) if p.strip()]
        items: List[dict] = []
        for idx, part in enumerate(parts, start=1):
            items.append({"ref": str(idx), "content": part})
        return items

    items: List[dict] = []
    starts = [m.start() for m in matches]
    starts.append(len(content))

    def normalise_ref(marker: str) -> str:
        ref = marker.strip()
        ref = ref.strip('()')
        ref = ref.rstrip('.')
        return ref

    for i in range(len(matches)):
        m = matches[i]
        start_idx = m.start()
        end_idx = starts[i + 1]
        block = content[start_idx:end_idx].rstrip()
        marker = m.group('marker')
        items.append({
            "ref": normalise_ref(marker),
            "content": block
        })

    return items


# ----------------------------
# Main pipeline functions
# ----------------------------

def run_llm_pass_1(
    pdf_source: object,
    index_pages: Optional[Tuple[int, int]],
    out_dir: str = "debug_outputs",
) -> Tuple[dict, str, str]:
    """Run LLM Pass 1: extract document title, URL, and headings from PDF."""
    print(f"[UTILS] LLM Pass 1: Extracting text from pages {index_pages}")
    excerpt = extract_pdf_text(pdf_source, index_pages=index_pages, max_chars=200000)
    print(f"[UTILS] LLM Pass 1: Extracted {len(excerpt)} characters from PDF")
    
    msgs = build_headings_prompt(excerpt)
    print(f"[UTILS] LLM Pass 1: Calling OpenAI for document info and headings extraction")
    headings_raw = call_openai_for_headings(msgs)

    # Extract regulation info from LLM response
    regulation_info = headings_raw.get("regulation", {})
    regulation_title = regulation_info.get("title", "").strip()
    regulation_url = regulation_info.get("url", "").strip()
    
    articles_in = headings_raw.get("articles", [])
    normalised_articles: List[dict] = []
    for art in articles_in:
        normalised_articles.append({
            "title": (art.get("title") or "").strip(),
            "content": "",
            "items": art.get("items", []) if isinstance(art.get("items", []), list) else [],
            "path": art.get("path", []) if isinstance(art.get("path", []), list) else [],
        })

    headings_json = {
        "regulation": {"title": regulation_title, "url": regulation_url},
        "articles": normalised_articles,
    }
    
    print(f"[UTILS] LLM Pass 1: Extracted document title: '{regulation_title}'")
    print(f"[UTILS] LLM Pass 1: Extracted document URL: '{regulation_url}'")
    print(f"[UTILS] LLM Pass 1: Extracted {len(normalised_articles)} articles")

    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    with open(os.path.join(out_dir, f"excerpt_{ts}.txt"), "w", encoding="utf-8") as f:
        f.write(excerpt)
    with open(os.path.join(out_dir, f"messages_{ts}.json"), "w", encoding="utf-8") as f:
        json.dump(msgs, f, indent=2, ensure_ascii=False)
    with open(os.path.join(out_dir, f"headings_{ts}.json"), "w", encoding="utf-8") as f:
        json.dump(headings_json, f, indent=2, ensure_ascii=False)

    print(f"[LLM PASS 1] Wrote debug files with timestamp {ts} in {out_dir}/")
    return headings_json, excerpt, ts


def run_splitter_1(
    pdf_source: object,
    index_pages: Optional[Tuple[int, int]],
    headings_json: dict,
    source_excerpt: Optional[str] = None,
    out_dir: str = "debug_outputs",
) -> Tuple[dict, str]:
    """Splitter 1: Slice verbatim content between headings.

    Important:
    - TOC page range (index_pages) applies only to LLM Pass 1.
    - For splitting, we read from page (TOC end + 1) to the end of the PDF.
    - This ensures we capture the entire body text between headings, not the TOC excerpt.
    """
    body_start = (index_pages[1] + 1) if (index_pages and len(index_pages) > 1 and index_pages[1]) else 6
    print(f"[UTILS] Splitter 1: Reading body from page {body_start} onwards")
    # Always prefer reading the body after TOC for splitting; ignore excerpt here
    final_json = fill_contents_from_body(pdf_source, headings_json, index_pages=index_pages)
    print(f"[UTILS] Splitter 1: Filled content for {len(final_json.get('articles', []))} articles")

    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    with open(os.path.join(out_dir, f"final_{ts}.json"), "w", encoding="utf-8") as f:
        json.dump(final_json, f, indent=2, ensure_ascii=False)
    print(f"[SPLITTER 1] Wrote final_{ts}.json to {out_dir}/")
    return final_json, ts


def run_llm_pass_2(
    json_data: dict,
    out_dir: str = "debug_outputs",
) -> Tuple[dict, str]:
    """LLM Pass 2: Extract items for all articles."""
    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    data = json.loads(json.dumps(json_data))  # deep copy
    articles = data.get("articles", [])
    
    print(f"[UTILS] LLM Pass 2: Processing {len(articles)} articles for items extraction")

    for article_index, art in enumerate(articles):
        title = art.get("title", "")
        raw_content = _remove_footers_and_page_numbers(art.get("content", ""))
        
        print(f"[UTILS] LLM Pass 2: Processing article {article_index + 1}/{len(articles)}: {title[:50]}...")

        msgs = build_items_prompt(title, raw_content)
        items_obj = call_openai_for_items(msgs)
        items = items_obj.get("items", []) if isinstance(items_obj, dict) else []

        if not items:
            items = split_into_items_verbatim(raw_content)

        art["items"] = items
        print(f"[UTILS] LLM Pass 2: Article {article_index}: {len(items)} items extracted")

        # Save debug artifacts for this article
        with open(os.path.join(out_dir, f"items_article_{article_index}_{ts}.json"), "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
        with open(os.path.join(out_dir, f"messages_llm2_article_{article_index}_{ts}.json"), "w", encoding="utf-8") as f:
            json.dump(msgs, f, indent=2, ensure_ascii=False)

    # Save final result
    with open(os.path.join(out_dir, f"final_pass2_{ts}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"[UTILS] LLM Pass 2: Completed processing all articles")
    return data, ts


def run_llm_pass_3(
    json_data: dict,
    out_dir: str = "debug_outputs",
) -> Tuple[dict, str]:
    """LLM Pass 3: Extract hierarchical path for all articles."""
    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    data = json.loads(json.dumps(json_data))  # deep copy
    articles = data.get("articles", [])
    
    print(f"[UTILS] LLM Pass 3: Processing {len(articles)} articles for path extraction")

    for article_index, art in enumerate(articles):
        art_title = art.get("title", "")
        art_content = art.get("content", "") or ""
        
        print(f"[UTILS] LLM Pass 3: Processing article {article_index + 1}/{len(articles)}: {art_title[:50]}...")

        msgs = build_path_prompt(art_title, art_content)
        result = call_openai_for_path(msgs)
        path_list = result.get("path", []) if isinstance(result, dict) else []
        if not isinstance(path_list, list):
            path_list = []

        art["path"] = path_list
        print(f"[UTILS] LLM Pass 3: Article {article_index}: path={path_list}")

        # Save debug artifacts for this article
        with open(os.path.join(out_dir, f"messages_llm3_article_{article_index}_{ts}.json"), "w", encoding="utf-8") as f:
            json.dump(msgs, f, indent=2, ensure_ascii=False)
        with open(os.path.join(out_dir, f"path_article_{article_index}_{ts}.json"), "w", encoding="utf-8") as f:
            json.dump({"path": path_list}, f, indent=2, ensure_ascii=False)

    # Save final result
    with open(os.path.join(out_dir, f"final_pass3_{ts}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"[UTILS] LLM Pass 3: Completed processing all articles")
    return data, ts


