import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PDFViewer from './components/PDFViewer';
import JSONEditor from './components/JSONEditor';
import './App.css';

function App() {
  const [jsonData, setJsonData] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [pageStart, setPageStart] = useState('');
  const [pageEnd, setPageEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeButton, setActiveButton] = useState(null);
  const [llm1Done, setLlm1Done] = useState(false);
  const [splitter1Done, setSplitter1Done] = useState(false);
  const [llm2Done, setLlm2Done] = useState(false);
  const [llm3Done, setLlm3Done] = useState(false);

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
      let response;
      if (endpoint === 'llm-pass-1') {
        // Use multipart to upload the actual PDF file
        const form = new FormData();
        if (!pdfFile) throw new Error('No PDF selected');
        form.append('pdf', pdfFile);
        form.append('index_page_start', pageStart);
        form.append('index_page_end', pageEnd);
        response = await axios.post(`/api/${endpoint}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        // For Splitter and later passes, TOC range is not needed by backend
        const payload = {};
        if (includeJsonData && jsonData) payload.json_data = jsonData;
        response = await axios.post(`/api/${endpoint}`, payload);
      }
      
      if (response.data.status === 'success') {
        setJsonData(response.data.data);
        if (endpoint === 'llm-pass-1') {
          setLlm1Done(true);
          setSplitter1Done(false);
          setLlm2Done(false);
          setLlm3Done(false);
        }
        if (endpoint === 'llm-pass-2') {
          setLlm2Done(true);
        }
        if (endpoint === 'splitter-1') {
          setSplitter1Done(true);
        }
        if (endpoint === 'splitter-2') {
          setLlm3Done(true);
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
    setPdfFile(file);
    setJsonData(null);
    setLlm1Done(false);
    setSplitter1Done(false);
    setLlm2Done(false);
    setLlm3Done(false);
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
        <div className="top-actions"></div>
      </header>

      <div className="main-content">
        <div className="panel pdf-panel">
          <div className="pdf-controls">
            <label className="upload-btn">
              <input type="file" accept="application/pdf" onChange={handleUploadPdf} />
              Upload PDF
            </label>
          </div>
          {pdfFile ? (
            <PDFViewer 
              pdfFile={URL.createObjectURL(pdfFile)} 
              highlightedText={jsonData}
              onTextExtracted={handlePdfTextExtracted}
            />
          ) : (
            <div className="pdf-placeholder">Upload a PDF to begin</div>
          )}
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
                onChange={(e) => setPageStart(e.target.value)}
                placeholder="Start"
              />
              <input
                className={`toc-input ${pageEnd ? '' : 'invalid'}`}
                type="number"
                min="1"
                value={pageEnd}
                onChange={(e) => setPageEnd(e.target.value)}
                placeholder="End"
              />
            </div>
            <div className="action-inline">
              <button
                onClick={() => handleApiCall('llm-pass-1')}
                disabled={loading || !pdfFile || !pageStart || !pageEnd}
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
                disabled={!splitter1Done || loading}
                className={`pill-btn ${activeButton === 'llm-pass-2' ? 'active' : ''}`}
              >
                {loading && activeButton === 'llm-pass-2' ? 'Processing…' : 'LLM PASS 2'}
              </button>
              <button
                onClick={() => handleApiCall('llm-pass-3', true)}
                disabled={!llm2Done || loading}
                className={`pill-btn ${activeButton === 'llm-pass-3' ? 'active' : ''}`}
              >
                {loading && activeButton === 'llm-pass-3' ? 'Processing…' : 'LLM PASS 3'}
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