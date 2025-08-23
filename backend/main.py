from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from werkzeug.utils import secure_filename

# Import the working pipeline functions
from utils import (
    run_llm_pass_1 as pipeline_llm_pass_1,
    run_splitter_1 as pipeline_splitter_1,
    run_llm_pass_2 as pipeline_llm_pass_2,
    run_llm_pass_3 as pipeline_llm_pass_3,
)

app = Flask(__name__)
CORS(app)

# No persistent upload directory needed; process PDFs in memory

# In-memory state for the current session
STATE = {
    'pdf_bytes': None,  # in-memory PDF
    'pdf_name': None,
    'excerpt': '',
    'data': None,
}

@app.route('/api/llm-pass-1', methods=['POST'])
def llm_pass_1():
    """
    LLM Pass 1 endpoint
    Accepts multipart/form-data with 'pdf' file and JSON fields index_page_start, index_page_end.
    Processes the PDF entirely in memory and returns the headings JSON.
    """
    try:
        # Try file upload first (multipart)
        pdf_file = request.files.get('pdf')
        if pdf_file:
            filename = secure_filename(pdf_file.filename)
            STATE['pdf_bytes'] = pdf_file.read()
            STATE['pdf_name'] = filename
            print(f"[LLM-PASS-1] PDF received: {filename} ({len(STATE['pdf_bytes'] or b'')} bytes)")
        
        # Fallback to JSON body
        data = request.form.to_dict() if request.form else (request.json or {})
        index_page_start = int(data.get('index_page_start') or 1)
        index_page_end = int(data.get('index_page_end') or index_page_start)

        if not STATE.get('pdf_bytes'):
            return jsonify({'status': 'error', 'message': 'No PDF uploaded'}), 400

        print(f"[LLM-PASS-1] Processing TOC pages: {index_page_start}-{index_page_end}")

        headings_json, excerpt, _ = pipeline_llm_pass_1(
            STATE['pdf_bytes'],
            (index_page_start, index_page_end),
            out_dir=os.path.join(os.path.dirname(__file__), 'debug_outputs'),
        )
        STATE['excerpt'] = excerpt
        STATE['data'] = headings_json
        STATE['last_index_start'] = index_page_start
        STATE['last_index_end'] = index_page_end

        print(f"[LLM-PASS-1] Extracted {len(headings_json.get('articles', []))} articles")
        return jsonify({'status': 'success', 'data': headings_json})
    
    except Exception as e:
        print(f"[LLM-PASS-1 ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'LLM Pass 1 error: {str(e)}'}), 500

@app.route('/api/llm-pass-2', methods=['POST'])
def llm_pass_2():
    """
    LLM Pass 2 endpoint
    Payload (JSON): json_data (optional; defaults to last state)
    Processes items for each article sequentially and returns updated JSON.
    """
    try:
        body = request.json or {}
        data_in = body.get('json_data') or STATE.get('data')
        if not data_in:
            return jsonify({'status': 'error', 'message': 'No JSON provided. Run previous steps first.'}), 400

        print(f"[LLM-PASS-2] Processing {len(data_in.get('articles', []))} articles for items extraction")
        
        data_working, _ = pipeline_llm_pass_2(
            data_in,
            out_dir=os.path.join(os.path.dirname(__file__), 'debug_outputs')
        )

        STATE['data'] = data_working
        print(f"[LLM-PASS-2] Completed items extraction for all articles")
        return jsonify({'status': 'success', 'data': data_working})
    
    except Exception as e:
        print(f"[LLM-PASS-2 ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'LLM Pass 2 error: {str(e)}'}), 500

@app.route('/api/splitter-1', methods=['POST'])
def splitter_1():
    """
    Splitter 1 endpoint
    Payload (JSON): json_data (user-corrected headings)
    """
    try:
        body = request.json or {}
        print(f"[SPLITTER-1] Received body: {body}")
        print(f"[SPLITTER-1] Current STATE keys: {list(STATE.keys())}")
        print(f"[SPLITTER-1] STATE data exists: {STATE.get('data') is not None}")
        
        json_in = body.get('json_data') or STATE.get('data')
        
        # TOC range belongs to LLM Pass 1 only; Splitter derives body as (TOC end + 1 .. end)
        index_page_start = int(STATE.get('last_index_start') or 1)
        index_page_end = int(STATE.get('last_index_end') or index_page_start)

        if not STATE.get('pdf_bytes'):
            return jsonify({'status': 'error', 'message': 'No PDF uploaded yet'}), 400
        if not json_in:
            return jsonify({'status': 'error', 'message': 'No JSON provided. Run LLM Pass 1 first.'}), 400

        print(f"[SPLITTER-1] Processing with TOC range: {index_page_start}-{index_page_end}")
        print(f"[SPLITTER-1] PDF in memory: {STATE.get('pdf_name')} ({len(STATE.get('pdf_bytes') or b'')} bytes)")
        print(f"[SPLITTER-1] Articles count: {len(json_in.get('articles', []))}")
        print(f"[SPLITTER-1] JSON data source: {'from request' if body.get('json_data') else 'from STATE'}")

        final_json, _ = pipeline_splitter_1(
            STATE['pdf_bytes'],
            (index_page_start, index_page_end),
            json_in,
            source_excerpt=None,
            out_dir=os.path.join(os.path.dirname(__file__), 'debug_outputs'),
        )
        STATE['data'] = final_json
        return jsonify({'status': 'success', 'data': final_json})
    
    except Exception as e:
        print(f"[SPLITTER-1 ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'Splitter error: {str(e)}'}), 500

@app.route('/api/llm-pass-3', methods=['POST'])
def llm_pass_3():
    """
    LLM Pass 3 endpoint
    Payload (JSON): json_data (optional; defaults to last state)
    Processes hierarchical path for each article and returns updated JSON.
    """
    try:
        body = request.json or {}
        data_in = body.get('json_data') or STATE.get('data')
        if not data_in:
            return jsonify({'status': 'error', 'message': 'No JSON provided. Run previous steps first.'}), 400

        print(f"[LLM-PASS-3] Processing {len(data_in.get('articles', []))} articles for path extraction")
        
        data_working, _ = pipeline_llm_pass_3(
            data_in,
            out_dir=os.path.join(os.path.dirname(__file__), 'debug_outputs')
        )

        STATE['data'] = data_working
        print(f"[LLM-PASS-3] Completed path extraction for all articles")
        return jsonify({'status': 'success', 'data': data_working})
    
    except Exception as e:
        print(f"[LLM-PASS-3 ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'LLM Pass 3 error: {str(e)}'}), 500

@app.route('/api/ask-ai', methods=['POST'])
def ask_ai():
    """
    Ask AI endpoint for fixing content blocks.
    Accepts { snippet, path } and returns a suggestion.
    """
    try:
        data = request.json or {}
        snippet = data.get('snippet', '')
        path = data.get('path', '')
        
        print(f"[ASK-AI] Request for snippet: {snippet[:50]}... at path: {path}")
        
        # For now, return a placeholder response
        # TODO: Implement actual AI-powered content fixing
        return jsonify({
            'status': 'success',
            'message': 'AI suggestion generated',
            'suggestion': f"Consider revising: {snippet[:100]}...",
            'original_snippet': snippet,
            'path': path
        })
    
    except Exception as e:
        print(f"[ASK-AI ERROR] {str(e)}")
        return jsonify({'status': 'error', 'message': f'Ask AI error: {str(e)}'}), 500

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)