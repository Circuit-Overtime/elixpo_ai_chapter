/* eslint-disable */
/**
 * MermaidSequenceParser - Parses Mermaid sequenceDiagram syntax.
 *
 * Supports:
 * - participant/actor declarations
 * - Message types: ->>, -->>,->>x, -->>x, ->, -->, -x, --x
 * - Notes: Note left of, Note right of, Note over
 * - Activations: activate/deactivate
 * - Alt/else/opt/loop/par/critical/break blocks
 * - Auto-numbering (autonumber)
 * - Title
 */

// Message arrow types
const ARROW_TYPES = {
    '->>':  { solid: true,  arrowHead: 'open',   cross: false },
    '-->>': { solid: false, arrowHead: 'open',   cross: false },
    '->>x': { solid: true,  arrowHead: 'open',   cross: true  },
    '-->>x':{ solid: false, arrowHead: 'open',   cross: true  },
    '->':   { solid: true,  arrowHead: 'filled', cross: false },
    '-->':  { solid: false, arrowHead: 'filled', cross: false },
    '-x':   { solid: true,  arrowHead: 'cross',  cross: true  },
    '--x':  { solid: false, arrowHead: 'cross',  cross: true  },
};

// Sorted by length descending so longest match wins
const ARROW_PATTERNS = Object.keys(ARROW_TYPES).sort((a, b) => b.length - a.length);

export function parseSequenceDiagram(src) {
    if (typeof src !== 'string') return null;
    const lines = src.trim().split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
    if (lines.length === 0) return null;

    // Check header
    if (lines[0].toLowerCase() !== 'sequencediagram') return null;

    const participants = [];
    const participantSet = new Set();
    const messages = [];
    const notes = [];
    const blocks = [];      // alt/loop/opt etc
    const blockStack = [];  // nesting stack
    let title = '';
    let autoNumber = false;
    let msgIndex = 0;

    function ensureParticipant(name) {
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        if (!participantSet.has(trimmed)) {
            participantSet.add(trimmed);
            participants.push({ name: trimmed, type: 'participant' });
        }
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // Title
        if (line.match(/^title\s*:/i)) {
            title = line.replace(/^title\s*:\s*/i, '').trim();
            continue;
        }

        // Autonumber
        if (line.toLowerCase() === 'autonumber') {
            autoNumber = true;
            continue;
        }

        // Participant / Actor declaration
        const partMatch = line.match(/^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i);
        if (partMatch) {
            const type = partMatch[1].toLowerCase();
            const rawName = partMatch[3] || partMatch[2];
            const name = rawName.trim();
            if (!participantSet.has(name)) {
                participantSet.add(name);
                participants.push({ name, type });
            }
            continue;
        }

        // Note
        const noteMatch = line.match(/^Note\s+(left of|right of|over)\s+([^:]+?):\s*(.+)$/i);
        if (noteMatch) {
            const position = noteMatch[1].toLowerCase();
            const targets = noteMatch[2].split(',').map(s => s.trim());
            const text = noteMatch[3].trim();
            targets.forEach(t => ensureParticipant(t));
            notes.push({
                position,
                targets,
                text,
                atMessage: messages.length,  // placed after this many messages
            });
            continue;
        }

        // Block start: alt, else, opt, loop, par, critical, break
        const blockStartMatch = line.match(/^(alt|else|opt|loop|par|critical|break)\s*(.*)?$/i);
        if (blockStartMatch) {
            const blockType = blockStartMatch[1].toLowerCase();
            const label = (blockStartMatch[2] || '').trim();

            if (blockType === 'else') {
                // 'else' adds a section to current alt block
                if (blockStack.length > 0) {
                    const current = blockStack[blockStack.length - 1];
                    current.sections.push({ label, startMsg: messages.length });
                }
            } else {
                const block = {
                    type: blockType,
                    label,
                    startMsg: messages.length,
                    sections: [{ label, startMsg: messages.length }],
                    endMsg: messages.length,
                };
                blockStack.push(block);
            }
            continue;
        }

        // Block end
        if (line.toLowerCase() === 'end') {
            if (blockStack.length > 0) {
                const block = blockStack.pop();
                block.endMsg = messages.length;
                blocks.push(block);
            }
            continue;
        }

        // Activate / Deactivate
        const actMatch = line.match(/^(activate|deactivate)\s+(.+)$/i);
        if (actMatch) {
            ensureParticipant(actMatch[2].trim());
            continue;
        }

        // Message: From ARROW To: Text
        let foundArrow = null;
        let arrowPos = -1;
        for (const pattern of ARROW_PATTERNS) {
            const idx = line.indexOf(pattern);
            if (idx > 0) {
                // Make sure it's not part of a longer pattern
                foundArrow = pattern;
                arrowPos = idx;
                break;
            }
        }

        if (foundArrow && arrowPos > 0) {
            const from = line.substring(0, arrowPos).trim();
            const rest = line.substring(arrowPos + foundArrow.length);
            const colonIdx = rest.indexOf(':');
            let to, text;
            if (colonIdx >= 0) {
                to = rest.substring(0, colonIdx).trim();
                text = rest.substring(colonIdx + 1).trim();
            } else {
                to = rest.trim();
                text = '';
            }

            ensureParticipant(from);
            ensureParticipant(to);

            const arrowType = ARROW_TYPES[foundArrow];
            msgIndex++;

            messages.push({
                from,
                to,
                text,
                number: autoNumber ? msgIndex : null,
                ...arrowType,
            });
            continue;
        }
    }

    if (participants.length === 0) return null;

    return {
        type: 'sequenceDiagram',
        title,
        participants,
        messages,
        notes,
        blocks,
        autoNumber,
    };
}
