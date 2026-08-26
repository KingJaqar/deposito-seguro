/**
 * Phase 6 test coverage for I-20's replacement of the calculator's
 * `Function('use strict'; return (...))()` eval with a real parser (see
 * plans/deposito-seguro-audit-report.md §20, src/utils/calculatorExpression.ts).
 */
import { evaluateArithmeticExpression } from '../calculatorExpression';

describe('evaluateArithmeticExpression', () => {
  it('evaluates basic arithmetic with standard precedence', () => {
    expect(evaluateArithmeticExpression('2+3')).toBe(5);
    expect(evaluateArithmeticExpression('2+3*4')).toBe(14);
    expect(evaluateArithmeticExpression('(2+3)*4')).toBe(20);
    expect(evaluateArithmeticExpression('10/4')).toBe(2.5);
    expect(evaluateArithmeticExpression('10-4-1')).toBe(5);
  });

  it('handles unary minus', () => {
    expect(evaluateArithmeticExpression('-5+3')).toBe(-2);
    expect(evaluateArithmeticExpression('3*-2')).toBe(-6);
    expect(evaluateArithmeticExpression('--3')).toBe(3);
  });

  it('handles exponentiation, right-associative and higher precedence than * and /', () => {
    expect(evaluateArithmeticExpression('2**3')).toBe(8);
    expect(evaluateArithmeticExpression('2**3**2')).toBe(512); // 2**(3**2), not (2**3)**2
    expect(evaluateArithmeticExpression('2*3**2')).toBe(18); // 2*(3**2)
  });

  it('handles nested parentheses', () => {
    expect(evaluateArithmeticExpression('((1+2)*(3+4))')).toBe(21);
  });

  it('handles decimals', () => {
    expect(evaluateArithmeticExpression('1.5+2.25')).toBe(3.75);
  });

  it('ignores whitespace', () => {
    expect(evaluateArithmeticExpression(' 2 + 3 * 4 ')).toBe(14);
  });

  it('throws on division by zero instead of returning Infinity', () => {
    expect(() => evaluateArithmeticExpression('5/0')).toThrow();
  });

  it('throws on malformed expressions', () => {
    expect(() => evaluateArithmeticExpression('2+')).toThrow();
    expect(() => evaluateArithmeticExpression('(2+3')).toThrow();
    expect(() => evaluateArithmeticExpression('2+3)')).toThrow();
    expect(() => evaluateArithmeticExpression('')).toThrow();
  });

  it('never falls back to executing arbitrary JavaScript', () => {
    // A dynamic-code-eval implementation (the pre-I-20 `Function(...)`
    // approach) would happily execute this as `(1, console.log('pwned'))`-
    // style syntax if it ever slipped past sanitization. The parser here
    // has no such escape hatch: `,` isn't part of the grammar, so this
    // must throw, not silently return a number.
    expect(() => evaluateArithmeticExpression('1;console.log(1)')).toThrow();
  });
});
