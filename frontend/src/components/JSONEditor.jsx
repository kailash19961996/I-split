import React, { useEffect, useState, useRef } from 'react';
import { askAIForBlock } from '../utils/askAI';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-monokai';
import 'ace-builds/src-noconflict/ext-language_tools';

const JSONEditor = ({ jsonData, onChange, pdfText }) => {
  const [editorValue, setEditorValue] = useState('');
  const [highlightedRanges, setHighlightedRanges] = useState([]);
  const [blockStats, setBlockStats] = useState({ found: 0, notFound: 0 });
  const [redRanges, setRedRanges] = useState([]);
  const [showFixButton, setShowFixButton] = useState(false);
  const [currentSnippet, setCurrentSnippet] = useState('');
  const editorRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (jsonData) {
      // Custom JSON stringifier to preserve key order
      const formattedJson = JSON.stringify(jsonData, null, 2);
      setEditorValue(formattedJson);
      
      // Perform keyword matching and highlighting
      if (pdfText) {
        highlightMatches(formattedJson, pdfText);
      }
    }
  }, [jsonData, pdfText]);

  /**
   * Heavy normalisation.
   *  - Lower-case
   *  - Smart quotes → ASCII
   *  - Long dash → hyphen
   *  - Remove any char that is NOT letter / digit / quote / apostrophe / hyphen / whitespace
   *  - Collapse whitespace
   */
  const heavyClean = (str) => {
    if (!str) return '';
    
    console.log(`    🧹 HEAVY CLEAN INPUT: "${str.substring(0, 100)}..."`);
    
    const result = str
      .toLowerCase()
      // quotes
      .replace(/[""«»]/g, '"')
      .replace(/[''‛`´]/g, "'")
      // dashes
      .replace(/[–—‐‒]/g, '-')
      // handle escaped newlines
      .replace(/\\n\\n/g, ' ')
      .replace(/\\n/g, ' ')
      // newlines to space
      .replace(/\n/g, ' ')
      // strip remaining backslashes that are not part of escape sequence
      .replace(/\\(?![nrt\\"])/g, '')
      // keep only safe chars
      .replace(/[^a-z0-9"'\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
      
    console.log(`    ✨ HEAVY CLEAN OUTPUT: "${result.substring(0, 100)}..."`);
    return result;
  };

  /**
   * Splits JSON value into sentences using \n and \n\n as stoppers
   * This is the core logic: each \n or \n\n marks a sentence boundary
   * IMPORTANT: We ignore single \ and only split on \n and \n\n
   */
  const splitIntoSentences = (text) => {
    if (!text) return [];
    
    console.log(`    🔪 SPLITTING TEXT: "${text.substring(0, 100)}..."`);
    
    // Split ONLY by \n\n (paragraph breaks) and \n (line breaks)
    // This regex specifically looks for \n patterns, not just any \
    const sentences = text.split(/\\n\\n|\\n/);
    
    console.log(`    📝 Split into ${sentences.length} parts:`);
    sentences.forEach((sentence, i) => {
      console.log(`      [${i + 1}] "${sentence.substring(0, 50)}${sentence.length > 50 ? '...' : ''}"`);
    });
    
    // Filter out empty sentences and return trimmed sentences
    const filteredSentences = sentences
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0);
      
    console.log(`    ✅ After filtering: ${filteredSentences.length} sentences`);
    return filteredSentences;
  };

  /**
   * Simple sentence-by-sentence matching logic:
   * 1. Split JSON value by \n and \n\n into sentences
   * 2. Normalize each sentence (remove \, convert \n to space, lowercase)
   * 3. Check if normalized sentence exists in normalized PDF content
   * 4. Return true if ANY sentence matches, false otherwise
   */
  const findBestMatch = (value, pdfContent) => {
    console.log('\n=== ENHANCED MATCH CHECK ===');
    console.log(`Original JSON value: "${value.substring(0, 100)}..."`);
    
    if (!value || !pdfContent) return false;

    const cleanPdf = normalizeText(pdfContent);
    const cleanValue = normalizeText(value);
    
    console.log(`Clean PDF (first 200 chars): "${cleanPdf.substring(0, 200)}..."`);
    console.log(`Clean JSON value: "${cleanValue.substring(0, 100)}..."`);

    // Direct full string match
    if (cleanPdf.includes(cleanValue)) {
      console.log('✅ DIRECT FULL STRING MATCH!');
      return true;
    }

    // 5-word sliding window as requested
    const tokens = cleanValue.split(' ').filter(token => token.length > 0);
    console.log(`Split into ${tokens.length} tokens for sliding window`);
    
    if (tokens.length < 3) {
      console.log(`Short text (${tokens.length} tokens): Skipping sliding window`);
      return false;
    }

    // Use 5-word sliding window
    const windowSize = Math.min(5, tokens.length);
    for (let i = 0; i <= tokens.length - windowSize; i++) {
      const chunk = tokens.slice(i, i + windowSize).join(' ');
      if (cleanPdf.includes(chunk)) {
        console.log(`✅ SLIDING WINDOW MATCH! Size: ${windowSize}, Position: ${i}, Chunk: "${chunk.substring(0, 60)}..."`);
        return true;
      }
    }
    
    console.log('❌ NO MATCHES FOUND');
    console.log('=== END ENHANCED MATCH CHECK ===\n');
    return false;
  };

  /**
   * Enhanced text normalization for consistent comparison
   * Converts both JSON and PDF text to the same format
   */
  const normalizeText = (text) => {
    if (!text) return '';
    
    return text
      .toLowerCase()
      // Convert all types of quotes to standard quotes
      .replace(/[""«»]/g, '"')
      .replace(/[''‛`´]/g, "'")
      // Convert all types of dashes to standard dash
      .replace(/[–—‐‒]/g, '-')
      // Handle JSON escape sequences - convert \n and \n\n to spaces
      .replace(/\\n\\n/g, ' ')
      .replace(/\\n/g, ' ')
      // Handle actual newlines and paragraphs - convert to spaces
      .replace(/\n\n+/g, ' ')  // Multiple newlines (paragraphs) -> single space
      .replace(/\n/g, ' ')     // Single newlines -> single space
      // Remove remaining backslashes (except for valid escape sequences)
      .replace(/\\(?![nrt\\"])/g, '')
      // Keep only alphanumeric, quotes, dashes, and spaces
      .replace(/[^a-z0-9"'\-\s]/g, ' ')
      // Collapse multiple spaces to single space
      .replace(/\s+/g, ' ')
      .trim();
  };

  /**
   * Checks if a phrase exists in the PDF (after normalization).
   * Treats the PDF as one long line; handles newlines/escapes consistently.
   */
  const phraseMatches = (phrase, pdfContent) => {
    if (!phrase || !pdfContent) return false;
    const cleanPdf = normalizeText(pdfContent);
    const cleanPhrase = normalizeText(phrase);
    if (!cleanPhrase) return false;
    return cleanPdf.includes(cleanPhrase);
  };

  /**
   * Check if individual sentence matches PDF content using 5-word sliding window
   */
  const checkSentenceMatch = (sentence, pdfContent) => {
    if (!sentence || !pdfContent) return false;
    
    const cleanPdf = normalizeText(pdfContent);
    const cleanSentence = normalizeText(sentence);
    
    console.log(`    🔍 Checking sentence: "${cleanSentence.substring(0, 80)}..."`);
    
    // Direct full sentence match first
    if (cleanPdf.includes(cleanSentence)) {
      console.log(`    ✅ FULL SENTENCE MATCH!`);
      return true;
    }
    
    // 5-word sliding window as requested
    const tokens = cleanSentence.split(' ').filter(token => token.length > 0);
    if (tokens.length < 3) {
      console.log(`    ❌ Sentence too short (${tokens.length} tokens)`);
      return false;
    }
    
    // Use 5-word sliding window, but also try smaller windows for short sentences
    const windowSize = Math.min(5, tokens.length);
    
    for (let i = 0; i <= tokens.length - windowSize; i++) {
      const chunk = tokens.slice(i, i + windowSize).join(' ');
      if (cleanPdf.includes(chunk)) {
        console.log(`    ✅ SLIDING WINDOW MATCH! Window: ${windowSize} words, Chunk: "${chunk.substring(0, 60)}..."`);
        return true;
      }
    }
    
    // If 5-word window fails, try smaller windows (3-4 words) for partial matches
    if (windowSize === 5) {
      for (let size = 4; size >= 3; size--) {
      for (let i = 0; i <= tokens.length - size; i++) {
        const chunk = tokens.slice(i, i + size).join(' ');
        if (cleanPdf.includes(chunk)) {
            console.log(`    ✅ PARTIAL MATCH! Window: ${size} words, Chunk: "${chunk.substring(0, 60)}..."`);
          return true;
          }
        }
      }
    }
    
    console.log(`    ❌ No sentence match found`);
    return false;
  };

  /**
   * Recursively extracts all text values from a JSON object
   * Returns array of {value, path} objects
   */
  const extractAllTextValues = (obj, currentPath = []) => {
    const textValues = [];
    
    if (typeof obj === 'string') {
      // Extract ALL strings, even empty ones - we'll filter later
      textValues.push({
        value: obj,
        path: currentPath.join('.'),
        isEmpty: !obj.trim()
      });
      console.log(`    📝 Found string at ${currentPath.join('.')}: "${obj}" (empty: ${!obj.trim()})`);
    } else if (Array.isArray(obj)) {
      console.log(`    📋 Processing array at ${currentPath.join('.')} with ${obj.length} items`);
      obj.forEach((item, index) => {
        textValues.push(...extractAllTextValues(item, [...currentPath, `[${index}]`]));
      });
    } else if (obj && typeof obj === 'object') {
      console.log(`    📦 Processing object at ${currentPath.join('.')} with keys: ${Object.keys(obj).join(', ')}`);
      Object.keys(obj).forEach(key => {
        textValues.push(...extractAllTextValues(obj[key], [...currentPath, key]));
      });
    }
    
    return textValues;
  };

  /**
   * Word-by-word highlighting function that processes content precisely
   * Green = Found in PDF, Red = Not found in PDF
   */
  const highlightMatches = (jsonString, pdfContent) => {
    console.log('\n🎨 === STARTING WORD-BY-WORD HIGHLIGHTING PROCESS ===');
    console.log(`JSON string length: ${jsonString.length}`);
    console.log(`PDF content available: ${!!pdfContent}`);
    
    if (!pdfContent) {
      console.log('❌ No PDF content available - clearing all highlights');
      setHighlightedRanges([]);
      return;
    }

    // Parse JSON to extract all text values recursively
    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch (error) {
      console.log('⚠️ Invalid JSON - clearing highlights');
      setHighlightedRanges([]);
      return;
    }

    // Extract all text values from the parsed JSON
    console.log(`\n🔍 STARTING RECURSIVE EXTRACTION:`);
    const allTextValues = extractAllTextValues(parsedJson);
    console.log(`\n📋 EXTRACTED TEXT VALUES (${allTextValues.length} total):`);
    
    // Filter to only meaningful content values (not empty arrays, etc.)
    const contentValues = allTextValues.filter(item => {
      if (item.isEmpty) return false;
      const isRefField = /\.ref$/.test(item.path);
      
      // Skip non-content fields (none for path: we want to include path array strings)
      
      // Only include content, title, url, ref and path entries (for LLM Pass 3 results).
      // For path arrays, we include each string element; their paths end with "]" not the field name.
      const isAllowedField = /\.(content|title|url|ref)$/.test(item.path) || /\.path\.\[\d+\]$/.test(item.path);
      if (!isAllowedField) {
        return false;
      }
      
      // Minimal length: allow short refs, but avoid trivial empties elsewhere
      if (!isRefField && item.value.trim().length < 3) {
        return false;
      }
      
      return true;
    });
    
    console.log(`\n✅ CONTENT VALUES TO HIGHLIGHT (${contentValues.length}):`);
    contentValues.forEach((item, i) => {
      const preview = item.value.length > 50 ? item.value.substring(0, 50) + '...' : item.value;
      console.log(`  ${i + 1}. Path: ${item.path} | Value: "${preview}" (${item.value.length} chars)`);
    });
    
    if (contentValues.length === 0) {
      console.log(`\n⚠️ WARNING: No content values found for highlighting!`);
      setHighlightedRanges([]);
      return;
    }

    // Process each content value with word-by-word highlighting
    const allHighlights = [];
    let blocksFoundTotal = 0;
    let blocksNotFoundTotal = 0;
    
    contentValues.forEach((textValue, index) => {
      console.log(`\n🎯 Processing content value ${index + 1}: "${textValue.value.substring(0, 50)}${textValue.value.length > 50 ? '...' : ''}" at path: ${textValue.path}`);
      
      const result = highlightContentWordByWord(textValue, jsonString, pdfContent);
      allHighlights.push(...result.highlights);
      blocksFoundTotal += result.blocksFound;
      blocksNotFoundTotal += result.blocksNotFound;
    });
    
    // Apply all highlights to the editor
    console.log(`\n📊 HIGHLIGHTING SUMMARY:`);
    console.log(`Total highlights to apply: ${allHighlights.length}`);
    allHighlights.forEach((highlight, i) => {
      const color = highlight.className.includes('green') ? 'GREEN' : 'RED';
      console.log(`  ${i + 1}. Line ${highlight.startRow + 1}, cols ${highlight.startCol}-${highlight.endCol}: ${color}`);
    });
    
    setHighlightedRanges(allHighlights);
    setBlockStats({ found: blocksFoundTotal, notFound: blocksNotFoundTotal });
    setRedRanges(allHighlights.filter(h => h.className && h.className.indexOf('red') !== -1));
    console.log(`✅ Applied ${allHighlights.length} highlights to editor`);
    console.log('🎨 === END WORD-BY-WORD HIGHLIGHTING PROCESS ===\n');
  };

  /**
   * Word-by-word highlighting for precise content validation
   */
  const highlightContentWordByWord = (textValue, jsonString, pdfContent) => {
    const highlights = [];
    let blocksFound = 0;
    let blocksNotFound = 0;
    
    console.log(`  🔍 Starting word-by-word analysis for: "${textValue.value.substring(0, 100)}${textValue.value.length > 100 ? '...' : ''}"`);
    
    // Build the exact JSON-encoded representation of the value (as it appears in the editor)
    const jsonEncodedValueWithQuotes = JSON.stringify(textValue.value); // includes surrounding quotes
    const jsonEncodedValue = jsonEncodedValueWithQuotes.slice(1, -1);   // strip surrounding quotes

    // Prefer matching the specific key-value pair to avoid matching earlier duplicates
    const pathParts = (textValue.path || '').split('.');
    // Resolve the closest property name (skip array index segments like "[0]")
    let propName = 'content';
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const seg = pathParts[i];
      if (seg && !/^\[\d+\]$/.test(seg)) { propName = seg; break; }
    }

    // Helper to find nth occurrence
    const findNth = (haystack, needle, n, fromIndex = 0) => {
      let idx = fromIndex;
      for (let i = 0; i < n; i++) {
        idx = haystack.indexOf(needle, idx);
        if (idx === -1) return -1;
        if (i < n - 1) idx = idx + needle.length;
      }
      return idx;
    };

    let keyedIndex = -1;
    if (propName === 'path') {
      // Target the correct article's path array and the correct element index
      const artMatch = (textValue.path || '').match(/articles\.\[(\d+)\]/);
      const elemMatch = (textValue.path || '').match(/\.path\.\[(\d+)\]$/);
      const articleOrdinal = artMatch ? parseInt(artMatch[1], 10) : 0;
      const elemOrdinal = elemMatch ? parseInt(elemMatch[1], 10) : 0;

      // Find the Nth occurrence of "path": [ corresponding to the articleOrdinal
      const pathArrayToken = '"path": [';
      const arrayStart = findNth(jsonString, pathArrayToken, articleOrdinal + 1, 0);
      if (arrayStart !== -1) {
        // Within this array region, find the nth value occurrence
        const afterArray = jsonString.slice(arrayStart);
        const localIdx = findNth(afterArray, jsonEncodedValueWithQuotes, elemOrdinal + 1, 0);
        if (localIdx !== -1) {
          keyedIndex = arrayStart + localIdx;
        }
      }
    } else {
      const propPrefix = `"${propName}": `;
      keyedIndex = jsonString.indexOf(propPrefix + jsonEncodedValueWithQuotes);
    }

    // Fallback: plain value search if exact key-value not found
    if (keyedIndex === -1) {
      keyedIndex = jsonString.indexOf(jsonEncodedValueWithQuotes);
    }
    if (keyedIndex === -1) {
      console.log('  ❌ Could not find JSON-encoded value in editor string');
      return highlights;
    }

    // Compute base line/column at which the value starts in the editor
    let valueStartIndex;
    if (propName === 'path') {
      // For arrays, the start index is directly at the string's opening quote
      valueStartIndex = keyedIndex + 1;
    } else {
      const propPrefix = `"${propName}": `;
      valueStartIndex = keyedIndex + (jsonString.startsWith(propPrefix, keyedIndex) ? propPrefix.length + 1 : 1);
    }
    const beforeValue = jsonString.substring(0, valueStartIndex);
    const lines = beforeValue.split('\n');
    const startLine = lines.length - 1;
    const startCol = lines[lines.length - 1].length;
    console.log(`  📍 Found value at line ${startLine + 1}, col ${startCol}`);

    // Split content into sentences (\n and \n\n act as boundaries)
    const sentences = textValue.value.split(/\n\n|\n/).filter(s => s.trim().length > 0);
    console.log(`  📋 Split into ${sentences.length} sentences for word-by-word analysis`);

    // Track global processed characters in the raw (unencoded) value
    let processedChars = 0;

    sentences.forEach((sentence, sentenceIndex) => {
      console.log(`    📝 Processing sentence ${sentenceIndex + 1}: "${sentence.substring(0, 60)}..."`);

      // Where this sentence starts in the raw value
      const sentenceStartInValue = textValue.value.indexOf(sentence, processedChars);
      if (sentenceStartInValue === -1) {
        console.log('      ⚠️ Could not locate sentence in raw value');
        return;
      }

      // Words in this sentence
      const words = sentence.split(/\s+/).filter(word => word.trim().length > 0);
      console.log(`      📝 Split sentence into ${words.length} words`);

      // Group words into 6-word blocks (last block may be shorter)
      const BLOCK_SIZE = 6;
      let sentenceProcessed = 0; // processed chars within this sentence

      for (let blockStart = 0; blockStart < words.length; blockStart += BLOCK_SIZE) {
        const blockEnd = Math.min(words.length, blockStart + BLOCK_SIZE);
        const blockWords = words.slice(blockStart, blockEnd);
        const blockPhrase = blockWords.join(' ');

        // Determine match at block level
        const blockMatches = phraseMatches(blockPhrase, pdfContent);
        if (blockMatches) blocksFound++; else blocksNotFound++;

        // Emit per-word highlights using the block color
        for (let wi = blockStart; wi < blockEnd; wi++) {
          const word = words[wi];
          const wordStartInSentence = sentence.indexOf(word, sentenceProcessed);
          if (wordStartInSentence === -1) {
            console.log(`        ⚠️ Could not locate word "${word}" in sentence`);
            continue;
          }

          // Compute global start index for this word in the raw value
          const globalWordStart = sentenceStartInValue + wordStartInSentence;

          // Compute encoded lengths to map to editor columns
          const encodedPrefix = JSON.stringify(textValue.value.slice(0, globalWordStart)).slice(1, -1);
          const encodedWord = JSON.stringify(word).slice(1, -1);

          const wordStartCol = startCol + encodedPrefix.length;
          const wordEndCol = wordStartCol + encodedWord.length;

          highlights.push({
            startRow: startLine,
            startCol: wordStartCol,
            endRow: startLine,
            endCol: wordEndCol,
            className: blockMatches ? 'ace-highlight-green' : 'ace-highlight-red',
            type: 'text'
          });
          console.log(`        🎨 Added ${blockMatches ? 'GREEN' : 'RED'} for "${word}" at line ${startLine + 1}, cols ${wordStartCol}-${wordEndCol}`);

          sentenceProcessed = wordStartInSentence + word.length;
        }
      }

      processedChars = sentenceStartInValue + sentence.length;
    });

    console.log(`  ✅ Created ${highlights.length} word-level highlights`);
    return { highlights, blocksFound, blocksNotFound };
  };





  const handleChange = (newValue) => {
    console.log('\n⚡ === EDITOR CHANGE DETECTED ===');
    console.log(`New value length: ${newValue.length}`);
    console.log(`PDF text available: ${!!pdfText}`);
    
    setEditorValue(newValue);
    
    try {
      // Parse JSON and preserve structure
      const parsedJson = JSON.parse(newValue);
      console.log('✅ JSON is valid - updating parent component');
      onChange(parsedJson);
      
      // Re-highlight on change immediately
      if (pdfText) {
        console.log('🔄 Re-highlighting due to valid JSON change');
        highlightMatches(newValue, pdfText);
      } else {
        console.log('❌ No PDF text available for highlighting');
      }
    } catch (error) {
      console.log('⚠️ Invalid JSON - highlighting anyway');
      // Invalid JSON, still highlight what we can
      if (pdfText) {
        console.log('🔄 Re-highlighting despite invalid JSON');
        highlightMatches(newValue, pdfText);
      } else {
        console.log('❌ No PDF text available for highlighting');
      }
      console.error('JSON Parse Error:', error.message);
    }
    
    console.log('⚡ === END EDITOR CHANGE ===\n');
  };

  const handleEditorLoad = (editor) => {
    editorRef.current = editor;
  };

  const handleCursorChange = () => {
    if (!editorRef.current) return;
    const pos = editorRef.current.getCursorPosition();
    const row = pos.row;
    const col = pos.column;
    const match = redRanges.find(r => row === r.startRow && col >= r.startCol && col <= r.endCol);
    
    if (match) {
      // Extract snippet around cursor from editorValue
      const snippet = editorRef.current.session.getLine(row).slice(match.startCol, match.endCol);
      setCurrentSnippet(snippet);
      setShowFixButton(true);
    } else {
      setShowFixButton(false);
      setCurrentSnippet('');
    }
  };

  const handleFixWithAI = async () => {
    if (!currentSnippet) return;
    try {
      await askAIForBlock({ snippet: currentSnippet, path: '' });
    } catch (e) {
      // no-op for now
    }
  };

  return (
    <div className="json-editor-container" ref={containerRef}>
      <div className="editor-header">
        <div className="editor-title-section">
          <h3>JSON Editor</h3>
          {showFixButton && (
            <button className="fix-ai-btn pulsating" onClick={handleFixWithAI}>
              Fix with AI
            </button>
          )}
        </div>
        <div className="legend legend-compact">
          {(() => {
            const total = blockStats.found + blockStats.notFound;
            const pct = total ? ((blockStats.found / total) * 100).toFixed(2) : '0.00';
            const pctNum = parseFloat(pct);
            return (
              <div className="legend-stats">
                <span className={`pct-badge ${pctNum === 100 ? 'glow' : ''}`}>{pct}%</span>
                <span className="legend-item"><span className="legend-box green"></span>{blockStats.found} blocks</span>
                <span className="legend-item"><span className="legend-box red"></span>{blockStats.notFound} blocks</span>
              </div>
            );
          })()}
        </div>
      </div>
      
      <AceEditor
        mode="json"
        theme="monokai"
        value={editorValue}
        onChange={handleChange}
        onLoad={handleEditorLoad}
        onCursorChange={handleCursorChange}
        name="json-editor"
        editorProps={{ $blockScrolling: true }}
        setOptions={{
          enableBasicAutocompletion: true,
          enableLiveAutocompletion: true,
          enableSnippets: true,
          showLineNumbers: true,
          tabSize: 2,
          useWorker: false,
          wrap: true,
          wrapBehavioursEnabled: true
        }}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '8px'
        }}
        markers={highlightedRanges}
      />
    </div>
  );
  };

export default JSONEditor;