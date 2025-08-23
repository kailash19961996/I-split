from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json

app = Flask(__name__)
CORS(app)

# Dummy data paths
DUMMY_HEADINGS_PATH = "DASPA_2025_headings_llm_pass_1.json"
DUMMY_CONTENTS_PATH = "DASPA_2025_contents_splitter_1.json"

@app.route('/api/llm-pass-1', methods=['POST'])
def llm_pass_1():
    """
    LLM Pass 1 endpoint
    Payload: pdf, index_page_start, index_page_end
    """
    data = request.json
    pdf = data.get('pdf')
    index_page_start = data.get('index_page_start')
    index_page_end = data.get('index_page_end')
    
    # Load dummy headings data
    with open(DUMMY_HEADINGS_PATH, 'r') as f:
        headings_data = json.load(f)
    
    return jsonify({
        'status': 'success',
        'data': headings_data,
        'message': f'LLM Pass 1 executed for pages {index_page_start} to {index_page_end}'
    })

@app.route('/api/llm-pass-2', methods=['POST'])
def llm_pass_2():
    """
    LLM Pass 2 endpoint
    Payload: pdf, index_page_start, index_page_end
    """
    data = request.json
    pdf = data.get('pdf')
    index_page_start = data.get('index_page_start')
    index_page_end = data.get('index_page_end')
    
    # For now, return modified version of headings
    with open(DUMMY_HEADINGS_PATH, 'r') as f:
        headings_data = json.load(f)
    
    # Simulate LLM Pass 2 modifications
    headings_data['pass'] = 2
    
    return jsonify({
        'status': 'success',
        'data': headings_data,
        'message': f'LLM Pass 2 executed for pages {index_page_start} to {index_page_end}'
    })

@app.route('/api/splitter-1', methods=['POST'])
def splitter_1():
    """
    Splitter 1 endpoint
    Payload: pdf, index_page_start, index_page_end, json_data (error corrected by user)
    """
    data = request.json
    pdf = data.get('pdf')
    index_page_start = data.get('index_page_start')
    index_page_end = data.get('index_page_end')
    json_data = data.get('json_data')
    
    # Load dummy contents data
    with open(DUMMY_CONTENTS_PATH, 'r') as f:
        contents_data = json.load(f)
    
    return jsonify({
        'status': 'success',
        'data': contents_data,
        'message': f'Splitter 1 executed for pages {index_page_start} to {index_page_end}'
    })

@app.route('/api/splitter-2', methods=['POST'])
def splitter_2():
    """
    Splitter 2 endpoint
    Payload: pdf, index_page_start, index_page_end, json_data (error corrected by user)
    """
    data = request.json
    pdf = data.get('pdf')
    index_page_start = data.get('index_page_start')
    index_page_end = data.get('index_page_end')
    json_data = data.get('json_data')
    
    # Load and modify dummy contents data
    with open(DUMMY_CONTENTS_PATH, 'r') as f:
        contents_data = json.load(f)
    
    # Simulate Splitter 2 modifications
    contents_data['pass'] = 2
    
    return jsonify({
        'status': 'success',
        'data': contents_data,
        'message': f'Splitter 2 executed for pages {index_page_start} to {index_page_end}'
    })

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)