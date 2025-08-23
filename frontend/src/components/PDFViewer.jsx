import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set worker path
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const PDFViewer = ({ pdfFile, highlightedText, onTextExtracted }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.4);

  const onDocumentLoadSuccess = async (pdf) => {
    setNumPages(pdf.numPages);
    
    // Extract text from all pages with better formatting preservation
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Preserve line structure by checking text positions
        let pageText = '';
        let lastY = null;
        
        textContent.items.forEach((item, index) => {
          // Check if this is a new line based on Y position
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            pageText += ' '; // Add space for line breaks
          }
          
          pageText += item.str;
          
          // Add space between items on the same line
          if (index < textContent.items.length - 1) {
            const nextItem = textContent.items[index + 1];
            if (Math.abs(item.transform[5] - nextItem.transform[5]) < 5) {
              pageText += ' ';
            }
          }
          
          lastY = item.transform[5];
        });
        
        fullText += pageText + ' ';
      } catch (error) {
        console.error(`Error extracting text from page ${i}:`, error);
      }
    }
    
    // Clean up the text while preserving structure
    const cleanText = fullText
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    
    console.log('\n📄 === PDF TEXT EXTRACTION COMPLETE ===');
    console.log(`Extracted ${cleanText.length} characters from ${pdf.numPages} pages`);
    console.log(`First 300 characters: "${cleanText.substring(0, 300)}..."`);
    console.log(`Last 300 characters: "...${cleanText.substring(cleanText.length - 300)}"`);
    console.log('📄 === END PDF EXTRACTION ===\n');
      
    if (onTextExtracted) {
      onTextExtracted(cleanText);
    }
  };

  const goToPrevPage = () => {
    setPageNumber(pageNumber - 1 <= 1 ? 1 : pageNumber - 1);
  };

  const goToNextPage = () => {
    setPageNumber(pageNumber + 1 >= numPages ? numPages : pageNumber + 1);
  };

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-controls">
        <button 
          onClick={goToPrevPage} 
          disabled={pageNumber <= 1}
          className="control-button"
        >
          Previous
        </button>
        <span className="page-info">
          Page {pageNumber} of {numPages || '?'}
        </span>
        <button 
          onClick={goToNextPage} 
          disabled={pageNumber >= numPages}
          className="control-button"
        >
          Next
        </button>
        <div className="zoom-controls">
          <button 
            onClick={() => setScale(scale - 0.1)} 
            disabled={scale <= 0.5}
            className="control-button"
          >
            -
          </button>
          <span className="zoom-info">{Math.round(scale * 100)}%</span>
          <button 
            onClick={() => setScale(scale + 0.1)} 
            disabled={scale >= 2}
            className="control-button"
          >
            +
          </button>
        </div>
      </div>
      
      <div className="pdf-document-wrapper">
        <Document
          file={pdfFile}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="loading-container">
              <div className="loader"></div>
              <p>Loading PDF...</p>
            </div>
          }
          error={
            <div className="error-container">
              <p>Failed to load PDF.</p>
            </div>
          }
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
};

export default PDFViewer;