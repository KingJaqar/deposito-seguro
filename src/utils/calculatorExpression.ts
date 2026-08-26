// File: src/utils/calculatorExpression.ts
/**
 * I-20 remediation (plans/deposito-seguro-audit-report.md §11): a small
 * recursive-descent parser for the sanitized calculator expression, used
 * in place of `Function('use strict'; return (...))()` in login.tsx's
 * calculator-disguise UI. The input is already restricted to digits, the
 * arithmetic operators, parens, and `**` (see login.tsx's evaluateExpression
 * sanitize step) before it reaches this parser, so dynamic code evaluation
 * was never strictly necessary here — this removes it entirely rather than
 * relying on the pre-sanitization to make it safe. Pulled into its own
 * module (rather than living inline in login.tsx) so it can be unit tested
 * without importing the whole calculator screen's React Native/expo-router
 * dependency tree.
 *
 * Grammar (standard precedence, `**` right-associative):
 *   expr   := term (('+' | '-') term)*
 *   term   := power (('*' | '/') power)*
 *   power  := unary ('**' power)?
 *   unary  := ('-' | '+') unary | primary
 *   primary:= NUMBER | '(' expr ')'
 */
export function evaluateArithmeticExpression(sanitized: string): number {
  const s = sanitized.replace(/\s+/g, '');
  let i = 0;

  const peek = () => s[i];
  const peek2 = () => s.slice(i, i + 2);

  const parsePrimary = (): number => {
    if (peek() === '(') {
      i++;
      const value = parseExpr();
      if (peek() !== ')') throw new Error('Expected )');
      i++;
      return value;
    }
    const start = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (start === i) throw new Error('Expected number');
    const num = parseFloat(s.slice(start, i));
    if (isNaN(num)) throw new Error('Invalid number');
    return num;
  };

  const parseUnary = (): number => {
    if (peek() === '-') {
      i++;
      return -parseUnary();
    }
    if (peek() === '+') {
      i++;
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePower = (): number => {
    const base = parseUnary();
    if (peek2() === '**') {
      i += 2;
      return Math.pow(base, parsePower());
    }
    return base;
  };

  const parseTerm = (): number => {
    let value = parsePower();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const rhs = parsePower();
      if (op === '/') {
        if (rhs === 0) throw new Error('Division by zero');
        value = value / rhs;
      } else {
        value = value * rhs;
      }
    }
    return value;
  };

  const parseExpr = (): number => {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      value = op === '+' ? value + parseTerm() : value - parseTerm();
    }
    return value;
  };

  const result = parseExpr();
  if (i !== s.length) throw new Error('Unexpected trailing input');
  return result;
}
