/* eslint-disable */
/**
 * GraphMathParser - Parses math expressions into evaluable functions.
 * Supports: +, -, *, /, ^ (power), implicit multiplication (2x, 3sin(x))
 * Functions: sin, cos, tan, asin, acos, atan, sqrt, abs, log, ln, exp, floor, ceil
 * Constants: pi, e
 * Forms: "y = expr", "f(x) = expr", or just "expr"
 */

const FUNCTIONS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs,
    log: Math.log10, ln: Math.log, exp: Math.exp,
    floor: Math.floor, ceil: Math.ceil,
};

const CONSTANTS = { pi: Math.PI, e: Math.E };

// Tokenizer
function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        const ch = expr[i];
        if (/\s/.test(ch)) { i++; continue; }
        if ('+-*/^(),'.includes(ch)) {
            tokens.push({ type: 'op', value: ch });
            i++;
            continue;
        }
        // Number (including decimals)
        if (/[0-9.]/.test(ch)) {
            let num = '';
            while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
            tokens.push({ type: 'num', value: parseFloat(num) });
            continue;
        }
        // Identifier (variable, function, or constant)
        if (/[a-zA-Z_]/.test(ch)) {
            let name = '';
            while (i < expr.length && /[a-zA-Z_0-9]/.test(expr[i])) { name += expr[i]; i++; }
            tokens.push({ type: 'id', value: name });
            continue;
        }
        i++; // skip unknown chars
    }
    return tokens;
}

// Insert implicit multiplication tokens
function insertImplicitMul(tokens) {
    const result = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        result.push(t);
        if (i + 1 < tokens.length) {
            const next = tokens[i + 1];
            const needsMul =
                // num followed by id or (  → 2x, 2(x), 2sin(x)
                (t.type === 'num' && (next.type === 'id' || next.value === '(')) ||
                // ) followed by ( or id or num → (x)(y), (x)2
                (t.value === ')' && (next.type === 'num' || next.type === 'id' || next.value === '(')) ||
                // id followed by ( when id is NOT a function → x(2) means x*2
                (t.type === 'id' && next.value === '(' && !FUNCTIONS[t.value]) ||
                // id/num followed by id → xy means x*y
                (t.type === 'id' && !FUNCTIONS[t.value] && next.type === 'id') ||
                // num followed by num after implicit patterns (rare)
                (t.type === 'id' && !FUNCTIONS[t.value] && next.type === 'num');
            if (needsMul) {
                result.push({ type: 'op', value: '*' });
            }
        }
    }
    return result;
}

// Recursive descent parser → builds evaluable function tree
function parse(tokens) {
    let pos = 0;

    function peek() { return tokens[pos]; }
    function consume(expected) {
        const t = tokens[pos];
        if (expected && (!t || t.value !== expected)) return null;
        pos++;
        return t;
    }

    // Expression: term ((+|-) term)*
    function parseExpr() {
        let left = parseTerm();
        while (peek() && (peek().value === '+' || peek().value === '-')) {
            const op = consume().value;
            const right = parseTerm();
            const l = left, r = right;
            if (op === '+') left = (x) => l(x) + r(x);
            else left = (x) => l(x) - r(x);
        }
        return left;
    }

    // Term: power ((*|/) power)*
    function parseTerm() {
        let left = parsePower();
        while (peek() && (peek().value === '*' || peek().value === '/')) {
            const op = consume().value;
            const right = parsePower();
            const l = left, r = right;
            if (op === '*') left = (x) => l(x) * r(x);
            else left = (x) => { const d = r(x); return d === 0 ? NaN : l(x) / d; };
        }
        return left;
    }

    // Power: unary (^ unary)*  (right-associative)
    function parsePower() {
        let base = parseUnary();
        if (peek() && peek().value === '^') {
            consume();
            const exp = parsePower(); // right-associative
            const b = base;
            base = (x) => Math.pow(b(x), exp(x));
        }
        return base;
    }

    // Unary: (+|-) primary
    function parseUnary() {
        if (peek() && peek().value === '-') {
            consume();
            const val = parsePrimary();
            return (x) => -val(x);
        }
        if (peek() && peek().value === '+') { consume(); }
        return parsePrimary();
    }

    // Primary: number | variable | function(expr) | (expr)
    function parsePrimary() {
        const t = peek();
        if (!t) return () => NaN;

        // Number
        if (t.type === 'num') {
            consume();
            const v = t.value;
            return () => v;
        }

        // Parenthesized expression
        if (t.value === '(') {
            consume('(');
            const inner = parseExpr();
            consume(')');
            return inner;
        }

        // Identifier
        if (t.type === 'id') {
            consume();
            const name = t.value.toLowerCase();

            // Constant
            if (CONSTANTS[name] !== undefined) {
                const v = CONSTANTS[name];
                return () => v;
            }

            // Function call
            if (FUNCTIONS[name] && peek() && peek().value === '(') {
                consume('(');
                const arg = parseExpr();
                consume(')');
                const fn = FUNCTIONS[name];
                return (x) => fn(arg(x));
            }

            // Variable 'x'
            if (name === 'x') return (x) => x;

            // Unknown identifier — treat as x
            return (x) => x;
        }

        // Fallback
        consume();
        return () => NaN;
    }

    const fn = parseExpr();
    return fn;
}

/**
 * Parse a math expression string into a callable (x) => y function.
 * Returns null if parsing fails.
 */
export function parseExpression(input) {
    if (!input || typeof input !== 'string') return null;

    try {
        let expr = input.trim();

        // Strip "y =" or "f(x) =" prefix
        expr = expr.replace(/^[yf]\s*\(?\s*x?\s*\)?\s*=\s*/i, '');
        if (!expr) return null;

        const tokens = tokenize(expr);
        if (tokens.length === 0) return null;

        const withMul = insertImplicitMul(tokens);
        const fn = parse(withMul);

        // Validate: test with a few x values
        const test1 = fn(0);
        const test2 = fn(1);
        if (typeof test1 !== 'number' && typeof test2 !== 'number') return null;

        return fn;
    } catch (e) {
        return null;
    }
}

/**
 * Validate an expression string — returns true if parseable.
 */
export function isValidExpression(input) {
    return parseExpression(input) !== null;
}
