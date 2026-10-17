let lastEnterTime = 0;
let enterCount = 0;

function handleBlockFormatting(lineEl) {
  const text = lineEl.textContent;
  const section = lineEl.parentNode;
  console.log(lineEl.tagName)
  
  // Check if we're inside a table cell (TD)
  const isInTableCell = lineEl.closest('td') !== null;
  
  if (lineEl.tagName === 'P') {
    // Handle table-specific formatting first
    if (isInTableCell) {
      return handleTableCellFormatting(lineEl, text);
    }

    if (
      text === 'TABLE\u00A0' ||
      text === 'TABLE  ' ||
      text === 'TABLE\u00A0\u00A0'
    ) {
      updateCurrentBlock("TABLE");
      const hexID = generateHexID();
      // Use the createTable function from docsGeneral.js, which returns the correct HTML structure
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = createTable(hexID);
      const table = tempDiv.firstElementChild;

      // Set equal column widths for all <td> in the first row
      const firstRowTds = table.querySelectorAll('tr:first-child td');
      firstRowTds.forEach(td => {
        td.style.maxWidth = '200px';
        td.style.width = '200px';
      });

      // Attach event listeners to all <td> elements
      const allTds = table.querySelectorAll('td');
      allTds.forEach(td => {
        // Initial markdown processing for the p tags inside td
        const pTags = td.querySelectorAll('p');
        pTags.forEach(p => {
          processEntireLineContent(p);
        });

        // On input, process markdown for the current p tag
        td.addEventListener('input', (e) => {
          const targetP = e.target.closest('p');
          if (targetP) {
            processEntireLineContent(targetP);
          }
        });

        // Keyboard navigation and editing
        td.addEventListener('keydown', (e) => {

          if (e.key === "Backspace") {
            const pTags = td.querySelectorAll('p');
            // Remove any empty <p> tag, or remove the table if all <p> tags are empty
            let allEmpty = true;
            pTags.forEach(p => {
              if (p.textContent.trim() === '') {
                p.remove();
              } else {
                allEmpty = false;
              }
            });
            if (allEmpty) {
              const table = td.closest('table');
              if (table) {
                table.remove();
              }
            }
          }
        });

        td.addEventListener('blur', () => {
          const pTags = td.querySelectorAll('p');
          pTags.forEach(p => {
            processEntireLineContent(p);
          });
        });

        // Make sure the first p in each td is focusable
        const firstP = td.querySelector('p');
        if (firstP) {
          firstP.addEventListener('focus', () => {
            removeDefaultTextIfPresent(firstP);
          });
        }
      });

      // Replace the current line with the table, following the section structure
      if (lineEl.parentNode === section) {
        section.replaceChild(table, lineEl);
      } else {
        lineEl.parentNode.replaceChild(table, lineEl);
      }
      const newP = createParagraph();
      section.appendChild(newP);
      
      // Focus on the first p tag in the first td
      const firstTd = table.querySelector('td');
      const firstP = firstTd.querySelector('p');
      if (firstP) {
        placeCaretAtStart(firstP);
      }
      return true;
    }

    if (text === '```\u00A0' || text === '```  ' || text === '```\u00A0\u00A0') {
      updateCurrentBlock("CODE_BLOCK");
      console.log("inside code creation")
      const hexID = generateHexID();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = createCodeBlock(hexID);
      const pre = tempDiv.firstElementChild;
      const code = pre.querySelector('code');
      const copyButton = pre.querySelector('i[data-copy-btn]');

      pre.id = `pre_${hexID}`;
      
      // --- FIX: Make code element editable ---
      code.contentEditable = true;
      code.setAttribute('data-placeholder', window.t ? window.t('docs.enterCodeHere') : 'Enter your code here...');

      copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(code.textContent);
        copyButton.classList.add('copied');
        setTimeout(() => copyButton.classList.remove('copied'), 1500);
      });

      // --- FIX: Add input event listener for code editing ---
      code.addEventListener('input', (e) => {
        // Prevent auto-formatting inside code blocks
        e.stopPropagation();
        
        // Update currentLineFormat to point to the code element
        const sel = window.getSelection();
        const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        currentLineFormat = {
          sel: sel,
          range: range,
          currentLine: pre 
        };
      });


      code.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const selection = window.getSelection();
          const range = selection.getRangeAt(0);

          const tabText = document.createTextNode('    '); // 4 spaces
          range.insertNode(tabText);
          // Move caret after inserted tab
          range.setStartAfter(tabText);
          range.setEndAfter(tabText);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          const range = document.createRange();
          range.selectNodeContents(code);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }

        // Only clear code if the caret is at the start or end and all is selected
        if (
          (e.key === 'Backspace' || e.key === 'Delete') &&
          code.textContent.length > 0
        ) {
          const sel = window.getSelection();
          // Check if all content is selected
          if (
            sel.rangeCount === 1 &&
            sel.anchorNode === sel.focusNode &&
            sel.anchorOffset === 0 &&
            sel.focusOffset === code.textContent.length - 2
          ) {
            e.preventDefault();
            code.textContent = '';
            code.innerHTML = '\u200B';
            placeCaretAtStart(code);
            updateCodeBlockClasses(code);
            return;
          }
          // If caret is at start and Backspace is pressed, clear code
          if (
            e.key === 'Backspace' &&
            sel.rangeCount === 1 &&
            sel.anchorOffset === 0
          ) {
            console.log(code.firstChild)
            e.preventDefault();
            code.textContent = '';
            code.innerHTML = '\u200B';
            placeCaretAtStart(code);
            updateCodeBlockClasses(code);
            return;
          }
          // If caret is at end and Delete is pressed, clear code
          if (
            e.key === 'Delete' &&
            sel.rangeCount === 1 &&
            sel.anchorNode === code.firstChild &&
            sel.anchorOffset === code.textContent.length
          ) {
            e.preventDefault();
            code.textContent = '';
            code.innerHTML = '\u200B';
            placeCaretAtStart(code);
            updateCodeBlockClasses(code);
            return;
          }
        }
      });

      section.replaceChild(pre, lineEl);
      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtStart(code);
      

      setTimeout(() => {
        currentLineFormat.currentLine = pre;
      }, 0);
      
      return true;
    }

    else if (text === '---\u00A0\u00A0' || text === '***\u00A0\u00A0' || text === '___\u00A0\u00A0' || text === '---\u00A0\u00A0') {
      currentBlock = "HORIZONTAL_RULE";
      const hexID = generateHexID();
      const hr = document.createElement('hr');
      hr.id = `hr_${hexID}`;
      section.replaceChild(hr, lineEl);

      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtStart(newP);
      return true;
    }

    else if (/^(?:\s|\u00A0)*#{1,6}(?:\s|\u00A0)+.*/.test(text)) {
      updateCurrentBlock(`HEADING${text.match(/#/g).length}`);
      const hexID = generateHexID();
      const hashCount = (text.match(/#/g) || []).length;
      const content = text.replace(/^(?:\s|\u00A0)*#{1,6}(?:\s|\u00A0)*/, '').trim() || '\u00A0';
      
      if (hashCount === 1) {
        const newSection = document.createElement('section');
        const h1 = document.createElement('h1');
        h1.id = `heading_${hexID}`;
        
        if (content !== '\u00A0' && hasMarkdownPattern(content)) {
          processMarkdownInText(content, h1);
        } else {
          h1.textContent = content;
        }
        
        newSection.appendChild(h1);
        
        const currentSection = lineEl.closest('section');
        currentSection.parentNode.insertBefore(newSection, currentSection.nextSibling);
        
        lineEl.remove();
        
        const newP = createParagraph();
        newSection.appendChild(newP);
        
        placeCaretAtStart(newSection);
        return true;
      }
      
      const heading = document.createElement(`h${Math.min(hashCount, 6)}`);
      heading.id = `heading_${hexID}`;
      
      if (content !== '\u00A0' && hasMarkdownPattern(content)) {
        processMarkdownInText(content, heading);
      } else {
        heading.textContent = content;
      }

      section.replaceChild(heading, lineEl);
      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtEnd(heading);
      return true;
    }

    const unorderedListMatch = text.match(/^-\s(.*)/);
    const orderedListMatch = text.match(/^\d+\.\s(.*)/);

    if (unorderedListMatch || orderedListMatch) {
      const isOrdered = !!orderedListMatch;
      const listType = isOrdered ? 'ol' : 'ul';
      const content = isOrdered ? orderedListMatch[1] : unorderedListMatch[1];

      updateCurrentBlock(isOrdered ? "ORDERED_LIST" : "UNORDERED_LIST");
      const hexID = generateHexID();
      const list = document.createElement(listType);
      list.id = `${listType}_${hexID}`;
      const li = document.createElement('li');
      li.id = `li_${generateHexID()}`;

      if (content && hasMarkdownPattern(content)) {
        processMarkdownInText(content, li);
      } else {
        li.textContent = content;
      }

      list.appendChild(li);
      section.replaceChild(list, lineEl);
      const newP = createParagraph();
      section.appendChild(newP);
      placeCaretAtEnd(li);
      return true;
    }

    const blockquoteMatch = text.match(/^>\s(.*)/);
    if (blockquoteMatch) {
      updateCurrentBlock("BLOCKQUOTE");
      const hexID = generateHexID();
      const content = blockquoteMatch[1];
      const blockquote = document.createElement('blockquote');
      blockquote.id = `blockquote_${hexID}`;
      
      if (content && hasMarkdownPattern(content)) {
        processMarkdownInText(content, blockquote);
      } else {
        blockquote.textContent = content;
      }

      section.replaceChild(blockquote, lineEl);
      const newP = createParagraph();
      section.appendChild(newP);

      placeCaretAtEnd(blockquote);
      return true;
    }
  }

  return false;
}

