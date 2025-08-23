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
  const [llm1Done, setLlm1Done] = useState(false);
  const [llm2Done, setLlm2Done] = useState(false);

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
        if (endpoint === 'llm-pass-1') {
          setLlm1Done(true);
        }
        if (endpoint === 'llm-pass-2') {
          setLlm2Done(true);
        }
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

  const handleUploadPdf = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPdfFile(url);
    setJsonData(null);
    setLlm1Done(false);
    setLlm2Done(false);
  };

  const handleTocStart = () => {
    setPageStart(1);
  };

  const handleTocEnd = () => {
    setPageEnd(Math.max(pageStart, 4));
  };

  return (
    <div className="app-container">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">i</span>Split
        </div>
        <div className="top-actions">
          <label className="upload-btn">
            <input type="file" accept="application/pdf" onChange={handleUploadPdf} />
            Upload PDF
          </label>
        </div>
      </header>

      <div className="main-content">
        <div className="panel pdf-panel">
          <PDFViewer 
            pdfFile={pdfFile} 
            highlightedText={jsonData}
            onTextExtracted={handlePdfTextExtracted}
          />
        </div>
        
        <div className="panel json-panel">
          <div className="json-actions">
            <div className="toc-inline">
              <span>Table of content</span>
              <input
                className={`toc-input ${pageStart ? '' : 'invalid'}`}
                type="number"
                min="1"
                value={pageStart}
                onChange={(e) => setPageStart(parseInt(e.target.value) || 1)}
                placeholder="Start"
              />
              <input
                className={`toc-input ${pageEnd ? '' : 'invalid'}`}
                type="number"
                min="1"
                value={pageEnd}
                onChange={(e) => setPageEnd(parseInt(e.target.value) || 1)}
                placeholder="End"
              />
            </div>
            <div className="action-inline">
              <button
                onClick={() => handleApiCall('llm-pass-1')}
                disabled={loading || !pageStart || !pageEnd}
                className={`pill-btn ${activeButton === 'llm-pass-1' ? 'active' : ''} ${(!pageStart || !pageEnd) ? 'danger' : ''}`}
              >
                {loading && activeButton === 'llm-pass-1' ? 'Processing…' : 'LLM PASS 1'}
              </button>
              <button
                onClick={() => handleApiCall('splitter-1', true)}
                disabled={!llm1Done || loading}
                className={`pill-btn ${activeButton === 'splitter-1' ? 'active' : ''}`}
              >
                {loading && activeButton === 'splitter-1' ? 'Processing…' : 'Splitter 1'}
              </button>
              <button
                onClick={() => handleApiCall('llm-pass-2')}
                disabled={!llm1Done || loading}
                className={`pill-btn ${activeButton === 'llm-pass-2' ? 'active' : ''}`}
              >
                {loading && activeButton === 'llm-pass-2' ? 'Processing…' : 'LLM PASS 2'}
              </button>
              <button
                onClick={() => handleApiCall('splitter-2', true)}
                disabled={!llm2Done || loading}
                className={`pill-btn ${activeButton === 'splitter-2' ? 'active' : ''}`}
              >
                {loading && activeButton === 'splitter-2' ? 'Processing…' : 'Splitter 2'}
              </button>
            </div>
          </div>
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