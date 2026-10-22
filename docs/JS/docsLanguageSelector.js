languages = [
    { name: "Auto-Detect", value: "auto" },
    { name: "JavaScript", value: "javascript" },
    { name: "Python", value: "python" },
    { name: "Java", value: "java" },
    { name: "CSharp", value: "csharp" },
    { name: "CPlusPlus", value: "cpp" },
    { name: "Ruby", value: "ruby" },
    { name: "PHP", value: "php" },
    { name: "Go", value: "go" },
    { name: "Swift", value: "swift" },
    { name: "Kotlin", value: "kotlin" },
    { name: "TypeScript", value: "typescript" },
    { name: "HTML", value: "html" },
    { name: "CSS", value: "css" },
    { name: "JSON", value: "json" },
    { name: "YAML", value: "yaml" },
    { name: "Markdown", value: "markdown" },
    { name: "Bash", value: "bash" },
    { name: "Shell", value: "shell" },
    { name: "HCL", value: "hcl" },
    { name: "Rust", value: "rust" },
    { name: "SQL", value: "sql" }
];

document.getElementById("languageSelection").innerHTML = languages.map(lang => `
    <div class="language" data-language="${lang.value}" ${lang.value === 'auto' ? 'data-i18n="docs.autoDetect"' : ''}>${lang.name}</div>
`).join("");

// Add event listeners for language selection
document.addEventListener('DOMContentLoaded', function() {
    const languageOptions = document.querySelectorAll('.language');
    
    languageOptions.forEach(option => {
        option.addEventListener('click', function() {
            const selectedLanguage = this.dataset.language;
            const selectedLanguageName = this.textContent;
            
            // Check if user is currently in a code block
            if (currentBlock === "CODE_BLOCK" && currentLineFormat.currentLine) {
                setCodeBlockLanguage(selectedLanguage, selectedLanguageName);
                

                document.getElementById("languageSelection").classList.add('hidden');
            }
        });
    });
});

function setCodeBlockLanguage(languageValue, languageName) {
    const currentCodeBlock = currentLineFormat.currentLine;
    console.log(currentCodeBlock.tagName)
    
    if (!currentCodeBlock || currentCodeBlock.tagName !== 'PRE') {
        console.warn("Not currently in a code block");
        return;
    }
    
    // Update the language name display
    const languageNameEl = currentCodeBlock.querySelector('[id="languageName"]');
    if (languageNameEl) {
        languageNameEl.textContent = languageName;
    }
    
    // Get the code element
    const codeElement = currentCodeBlock.querySelector('code');
    if (!codeElement) {
        console.warn("Code element not found in code block");
        return;
    }
    
    // Remove existing language classes
    const existingClasses = Array.from(codeElement.classList).filter(cls => cls.startsWith('language-'));
    existingClasses.forEach(cls => codeElement.classList.remove(cls));
    
    // Remove hljs classes and data attributes to allow re-highlighting
    codeElement.classList.remove('hljs');
    codeElement.removeAttribute('data-highlighted');
    
    // Remove any existing hljs syntax highlighting classes
    const hljsClasses = Array.from(codeElement.classList).filter(cls => 
        cls.startsWith('hljs-') || cls === 'hljs'
    );
    hljsClasses.forEach(cls => codeElement.classList.remove(cls));
    
    // Apply new language class if not auto-detect
    if (languageValue !== 'auto') {
        codeElement.classList.add(`language-${languageValue}`);
        
        // Apply syntax highlighting with hljs
        if (typeof hljs !== 'undefined') {
            hljs.highlightElement(codeElement);
        }
    } else {
        // For auto-detect, let hljs automatically detect
        if (typeof hljs !== 'undefined') {
            hljs.highlightElement(codeElement);
        }
    }
    
    // Store the selected language in a data attribute for future reference
    currentCodeBlock.dataset.language = languageValue;
    currentCodeBlock.dataset.languageName = languageName;
    document.getElementById("languageName").textContent = languageName;
    
    // Place cursor back in the code element
    setTimeout(() => {
        codeElement.focus();
        placeCaretAtEnd(codeElement);
        
        // Update the currentLineFormat to point to the code element
        currentLineFormat.currentLine = currentCodeBlock;
        
        // Create a new range for the code element
        const range = document.createRange();
        range.selectNodeContents(codeElement);
        range.collapse(false); // Collapse to end
        
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        
        currentLineFormat.range = range;
        currentLineFormat.sel = sel;
    }, 100); 
}

// Function to get current code block language
function getCurrentCodeBlockLanguage() {
    if (currentBlock === "CODE_BLOCK" && currentLineFormat.currentLine) {
        const currentCodeBlock = currentLineFormat.currentLine;
        return {
            value: currentCodeBlock.dataset.language || 'auto',
            name: currentCodeBlock.dataset.languageName || 'Auto-Detect'
        };
    }
    return null;
}

// Function to update language selector display when focusing on a code block
function updateLanguageSelectorForCodeBlock() {
    if (currentBlock === "CODE_BLOCK" && currentLineFormat.currentLine) {
        const currentLang = getCurrentCodeBlockLanguage();
        
        // Update the language name display
        const languageNameEl = document.getElementById('languageName');
        if (languageNameEl && currentLang) {
            languageNameEl.textContent = currentLang.name;
        }
        
        // Highlight the current language in the selector
        const languageOptions = document.querySelectorAll('.language');
        languageOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.language === currentLang.value) {
                option.classList.add('selected');
            }
        });
    }
}

document.getElementById("languageSelector").addEventListener("click", function(event) {
    document.getElementById("languageSelection").classList.toggle('hidden');
});