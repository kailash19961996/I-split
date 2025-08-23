import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PDFViewer from './components/PDFViewer';
import JSONEditor from './components/JSONEditor';
import './App.css';

function App() {
  const [jsonData, setJsonData] = useState(null);
  const [pdfFile, setPdfFile] = useState('/DASPA_2025.pdf');
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(4);
  const [loading, setLoading] = useState(false);
  const [activeButton, setActiveButton] = useState(null);

  // PDF text for keyword matching (extracted from actual PDF)
  const [pdfText, setPdfText] = useState('');

  const handlePdfTextExtracted = (extractedText) => {
    console.log('\n🔗 === PDF TEXT RECEIVED IN APP ===');
    console.log(`Received ${extractedText.length} characters from PDF`);
    console.log(`Setting PDF text state...`);
    setPdfText(extractedText);
    console.log('✅ PDF text state updated');
    console.log('🔗 === END PDF TEXT RECEIVED ===\n');
  };

  const handleApiCall = async (endpoint, includeJsonData = false) => {
    setLoading(true);
    setActiveButton(endpoint);
    
    try {
      const payload = {
        pdf: pdfFile,
        index_page_start: pageStart,
        index_page_end: pageEnd
      };
      
      if (includeJsonData && jsonData) {
        payload.json_data = jsonData;
      }
      
      const response = await axios.post(`/api/${endpoint}`, payload);
      
      if (response.data.status === 'success') {
        setJsonData(response.data.data);
      }
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      alert(`Failed to execute ${endpoint}. Please check the backend is running.`);
    } finally {
      setLoading(false);
      setActiveButton(null);
    }
  };

  const handleJsonChange = (newJsonData) => {
    setJsonData(newJsonData);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Intelligent Document Splitter</h1>
        <div className="page-range-controls">
          <label>
            Start Page:
            <input
              type="number"
              min="1"
              value={pageStart}
              onChange={(e) => setPageStart(parseInt(e.target.value) || 1)}
              className="page-input"
            />
          </label>
          <label>
            End Page:
            <input
              type="number"
              min="1"
              value={pageEnd}
              onChange={(e) => setPageEnd(parseInt(e.target.value) || 1)}
              className="page-input"
            />
          </label>
        </div>
      </header>

      <div className="control-panel">
        <button
          onClick={() => handleApiCall('llm-pass-1')}
          disabled={loading}
          className={`control-btn ${activeButton === 'llm-pass-1' ? 'active' : ''}`}
        >
          {loading && activeButton === 'llm-pass-1' ? 'Processing...' : 'LLM Pass 1'}
        </button>
        <button
          onClick={() => handleApiCall('llm-pass-2')}
          disabled={loading}
          className={`control-btn ${activeButton === 'llm-pass-2' ? 'active' : ''}`}
        >
          {loading && activeButton === 'llm-pass-2' ? 'Processing...' : 'LLM Pass 2'}
        </button>
        <button
          onClick={() => handleApiCall('splitter-1', true)}
          disabled={loading}
          className={`control-btn ${activeButton === 'splitter-1' ? 'active' : ''}`}
        >
          {loading && activeButton === 'splitter-1' ? 'Processing...' : 'Splitter 1'}
        </button>
        <button
          onClick={() => handleApiCall('splitter-2', true)}
          disabled={loading}
          className={`control-btn ${activeButton === 'splitter-2' ? 'active' : ''}`}
        >
          {loading && activeButton === 'splitter-2' ? 'Processing...' : 'Splitter 2'}
        </button>
      </div>

      <div className="main-content">
        <div className="panel pdf-panel">
          <PDFViewer 
            pdfFile={pdfFile} 
            highlightedText={jsonData}
            onTextExtracted={handlePdfTextExtracted}
          />
        </div>
        
        <div className="panel json-panel">
          <JSONEditor 
            jsonData={jsonData}
            onChange={handleJsonChange}
            pdfText={pdfText}
          />
        </div>
      </div>
    </div>
  );
}

export default App;