# Intelligent Document Splitter

A modern web application for splitting and analyzing PDF documents with intelligent JSON extraction and editing capabilities.

## Features

- **Split View Interface**: Independent scrollable panels for PDF and JSON
- **PDF Viewer**: Navigate through PDF pages with zoom controls
- **JSON Editor**: Syntax-highlighted editor with real-time validation
- **Keyword Matching**: Automatic highlighting of JSON values based on PDF content
  - Green: Values found in PDF
  - Red: Values not found in PDF
- **4 Processing Endpoints**:
  - LLM Pass 1 & 2: Extract document structure
  - Splitter 1 & 2: Split content with user corrections

## Project Structure

```
document-splitter/
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── App.jsx       # Main application
│   │   └── main.jsx      # Entry point
│   ├── public/           # Static assets
│   └── package.json      # Frontend dependencies
└── backend/              # Python Flask backend
    ├── main.py          # API endpoints
    └── requirements.txt # Backend dependencies
```

## Installation

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the backend server:
   ```bash
   python main.py
   ```

The backend will start on http://localhost:5000

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The frontend will start on http://localhost:3000

## Usage

1. Open http://localhost:3000 in your browser
2. The PDF viewer will display on the left side
3. Use the control buttons to process the document:
   - **LLM Pass 1**: Initial heading extraction
   - **LLM Pass 2**: Refined heading extraction
   - **Splitter 1**: Initial content splitting
   - **Splitter 2**: Refined content splitting with user corrections
4. Edit the JSON in the right panel as needed
5. The JSON values will be highlighted based on matches with the PDF content

## API Endpoints

- `POST /api/llm-pass-1`: Extract headings (first pass)
- `POST /api/llm-pass-2`: Extract headings (second pass)
- `POST /api/splitter-1`: Split content with user corrections
- `POST /api/splitter-2`: Split content (refined)

All endpoints accept:
```json
{
  "pdf": "pdf_file_path",
  "index_page_start": 1,
  "index_page_end": 4,
  "json_data": {}  // For splitter endpoints only
}
```

## Technologies Used

- **Frontend**: React, Vite, react-pdf, react-ace
- **Backend**: Flask, Flask-CORS
- **Styling**: Modern CSS with curved edges and shadows