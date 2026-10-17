hljs.highlightAll();
let enterPressCount = 0;
const editor = document.getElementById('editor');
let currentBlock = null;
let currentInlineBlock = null;
let currentLineFormat = {};
let currentSelection = {};
let preservedSelection = null;


function generateHexID() {
  return Math.random().toString(16).substr(2, 8);
}

function createSection() {
  const section = document.createElement('section');
  const h1 = document.createElement('h1');
  h1.innerHTML = '\u00A0<span class="default-text-not-editable" contenteditable="false">Untitled File</span>';
  const p = document.createElement('p');
  p.innerHTML = '\u00A0<span class="default-text-not-editable" contenteditable="false">Welcome to Elixpo Sketch, you can type your notes here -- styled with markdown support!</span>';

  let testTable = `
  <table id="table_05e019f7" contenteditable="false" style="border-collapse:collapse;">
      <tbody>
        <tr>
          <td contenteditable="true" style="vertical-align: top; max-width: 200px; width: 200px;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align: top; max-width: 200px; width: 200px;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align: top; max-width: 200px; width: 200px;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
        </tr>
        <tr>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
        </tr>
        <tr>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
        </tr>
      </tbody>
    </table>
  `
  section.appendChild(h1);
  section.appendChild(p);
  // section.innerHTML += (testTable);
  return section;
}

function createParagraph() {
  const p = document.createElement('p');
  const defaultSpan = document.createElement('span');
  defaultSpan.className = 'default-text';
  defaultSpan.innerHTML = '\u00A0';
  p.appendChild(defaultSpan);
  return p;
}

function createCodeBlock(hexID) {
  return `
    <pre data-slate-node="element" contenteditable="false">
      <code contenteditable="true" id="code_${hexID}" class="code_block hljs" data-slate-node="code" contenteditable="true"></code>
      <i class='bx bx-copy' data-copy-btn></i>
    </pre>
  `;
}

function createTable(hexID) {
  return `
    <table id="table_${hexID}" contenteditable="false" style="border-collapse:collapse;">
      <tbody>
        <tr>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
        </tr>
        <tr>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
        </tr>
        <tr>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
          <td contenteditable="true" style="vertical-align:top;">
            <p><span class="default-text">&nbsp;</span></p>
          </td>
        </tr>
      </tbody>
    </table>
  `;
}

function highlightCodeBlock(codeElement) {
  if (!codeElement) return;
  try {
    if (codeElement.dataset.highlighted) {
      delete codeElement.dataset.highlighted;
    }
    if (!codeElement.classList.contains('code_block')) {
      codeElement.classList.add('code_block');
    }
    hljs.highlightElement(codeElement);
  } catch (error) {
    console.warn("Highlight.js error:", error);
  }
}


function getCurrentLineElement() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;

  let node = sel.getRangeAt(0).startContainer;
  
  // If we're in a text node, start from its parent
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  // Traverse up the DOM tree to find the line element
  while (node && node !== editor) {
    // Check if this node is a line element we're looking for (including table elements)
    if (node.tagName === 'H1' || node.tagName === 'H2' || node.tagName === 'H3' || 
        node.tagName === 'H4' || node.tagName === 'H5' || node.tagName === 'H6' || 
        node.tagName === 'P' || node.tagName === 'BLOCKQUOTE' || 
        node.tagName === 'LI' || node.tagName === 'PRE' || 
        node.tagName === 'TD' || node.tagName === 'TH' || node.tagName === 'TR' || node.tagName === 'TABLE') {
      return node;
    }
    
    // Check if this node is a direct child of editor (section)
    if (node.parentNode === editor) {
      return node;
    }
    
    // Find section by traversing up manually
    let section = null;
    let tempNode = node;
    while (tempNode && tempNode !== editor) {
      if (tempNode.tagName === 'SECTION' && tempNode.parentNode === editor) {
        section = tempNode;
        break;
      }
      tempNode = tempNode.parentNode;
    }
    
    if (section) {
      // If current node is a direct child of section and is a line element
      if (node.parentNode === section && 
          (node.tagName === 'H1' || node.tagName === 'H2' || node.tagName === 'H3' || 
           node.tagName === 'H4' || node.tagName === 'H5' || node.tagName === 'H6' || 
           node.tagName === 'P' || node.tagName === 'BLOCKQUOTE' || 
           node.tagName === 'UL' || node.tagName === 'OL' || node.tagName === 'PRE' || node.tagName === 'SPAN'
          || node.tagName === 'LI' || node.tagName === 'TABLE')) {
        return node;
      }
      
      let parent = node;
      while (parent && parent !== section) {
        if (parent.tagName === 'H1' || parent.tagName === 'H2' || parent.tagName === 'H3' || 
            parent.tagName === 'H4' || parent.tagName === 'H5' || parent.tagName === 'H6' || 
            parent.tagName === 'P' || parent.tagName === 'BLOCKQUOTE' || 
            parent.tagName === 'LI' || parent.tagName === 'PRE' ||
            parent.tagName === 'TD' || parent.tagName === 'TH' || parent.tagName === 'TR' || parent.tagName === 'TABLE') {
          return parent;
        }
        parent = parent.parentNode;
      }
    }
    
    node = node.parentNode;
  }
  
  return null;
}

function placeCaretAtStart(el) {
  const range = document.createRange();
  const sel = window.getSelection();

  if (!el) return;

  if (el.nodeType === Node.TEXT_NODE) {
    range.setStart(el, 0);
  } else if (el.firstChild) {
    if (el.firstChild.nodeType === Node.TEXT_NODE) {
      range.setStart(el.firstChild, 0);
    } else {
      range.setStartBefore(el.firstChild);
    }
  } else {
    range.setStart(el, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  const sel = window.getSelection();

  if (!el) return;

  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function createNewLineElement() {
  const p = document.createElement('p');
  const defaultSpan = document.createElement('span');
  defaultSpan.className = 'default-text';
  defaultSpan.innerHTML = '\u00A0';
  p.appendChild(defaultSpan);
  return p;
}


function cleanupEmptySpans(node) {
  const spans = node.querySelectorAll('span');
  for (const span of spans) {
    if (
      !span.classList.contains('default-text-not-editable') &&
      (span.textContent === '' || span.textContent === '\u200B')
    ) {
      span.remove();
    }
  }
  if (
    node.tagName === 'P' || node.tagName === 'H1' || node.tagName === 'H2' ||
    node.tagName === 'H3' || node.tagName === 'H4' || node.tagName === 'H5' ||
    node.tagName === 'H6' || node.tagName === 'LI' || node.tagName === 'BLOCKQUOTE'
  ) {
    if (!node.querySelector('span.default-text') && !node.querySelector('span:not(.default-text)')) {
      const defaultSpan = document.createElement('span');
      defaultSpan.className = 'default-text';
      defaultSpan.innerHTML = '\u00A0';
      node.appendChild(defaultSpan);
    }
  }
}

function updateCodeBlockClasses(codeElement) {
  if (!codeElement) return;

  if (codeElement.dataset.highlighted) {
    delete codeElement.dataset.highlighted;
  }

  const result = hljs.highlightAuto(codeElement.textContent);

  codeElement.className = 'code_block hljs';

  if (result.language) {
    codeElement.classList.add(`language-${result.language}`);
    codeElement.dataset.detectedLanguage = result.language;
  }

  codeElement.innerHTML = result.value;
}

function getCursorPositionInCodeBlock(codeElement) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;

  const range = sel.getRangeAt(0);
  const preSelectionRange = range.cloneRange();
  preSelectionRange.selectNodeContents(codeElement);
  preSelectionRange.setEnd(range.startContainer, range.startOffset);

  return preSelectionRange.toString().length;
}

function restoreCursorPositionInCodeBlock(codeElement, position) {
  const sel = window.getSelection();
  const range = document.createRange();

  let currentPos = 0;
  const walker = document.createTreeWalker(
    codeElement,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  while (node = walker.nextNode()) {
    const nodeLength = node.textContent.length;
    if (currentPos + nodeLength >= position) {
      range.setStart(node, position - currentPos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    currentPos += nodeLength;
  }

  range.selectNodeContents(codeElement);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function removeDefaultTextIfPresent(element) {
  const defaultSpan = element.querySelector('.default-text-not-editable');
  if (defaultSpan) {
    defaultSpan.remove();
    if (element.textContent === '' || !element.querySelector('span')) {
      const newSpan = document.createElement('span');
      newSpan.className = 'default-text';
      newSpan.innerHTML = '\u00A0';
      element.innerHTML = '';
      element.appendChild(newSpan);
    }
  }
}

if (editor.children.length === 0 || editor.textContent.trim() === '') {
  editor.innerHTML = '';
  const initialSection = createSection();
  editor.appendChild(initialSection);
  placeCaretAtStart(initialSection.querySelector('p'));
} else {
  if (!editor.querySelector('section')) {
    const initialSection = createSection();
    editor.appendChild(initialSection);
    placeCaretAtStart(initialSection.querySelector('p'));
  }
}


document.addEventListener('DOMContentLoaded', () => {
  // Initialize editor content and cursor position
  if (editor.children.length === 0 || editor.textContent.trim() === '') {
    editor.innerHTML = '';
    const initialSection = createSection();
    editor.appendChild(initialSection);
    const firstP = initialSection.querySelector('p');
    setTimeout(() => {
      placeCaretAtStart(firstP);
      firstP.focus();
    }, 100);
  } else {
    // If editor has content but no sections, create one
    if (!editor.querySelector('section')) {
      const initialSection = createSection();
      editor.appendChild(initialSection);
      const firstP = initialSection.querySelector('p');
      setTimeout(() => {
        placeCaretAtStart(firstP);
        firstP.focus();
      }, 100);
    } else {
      // Find the first paragraph in the first section and place cursor there
      const firstSection = editor.querySelector('section');
      const firstP = firstSection ? firstSection.querySelector('p') : null;
      if (firstP) {
        setTimeout(() => {
          placeCaretAtStart(firstP);
          firstP.focus();
        }, 100);
      }
    }
  }
});