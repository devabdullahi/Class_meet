import { expect, test } from 'vitest';
import { emailProblem, formatCountdown, typedCode } from './emailSignIn';

const UTA = ['mavs.uta.edu', 'uta.edu'];

test('a UTA address, however it was typed, may be sent', () => {
  expect(emailProblem('jane.doe@mavs.uta.edu', UTA)).toBeNull();
  expect(emailProblem('  Jane.Doe@MAVS.UTA.EDU ', UTA)).toBeNull();
  expect(emailProblem('prof@uta.edu', UTA)).toBeNull();
});

test('anything else says which addresses work', () => {
  const problem = 'Use your UTA email (…@mavs.uta.edu or …@uta.edu).';
  expect(emailProblem('jane@gmail.com', UTA)).toBe(problem);
  expect(emailProblem('jane@mavs.uta.edu.evil.com', UTA)).toBe(problem);
  expect(emailProblem('jane', UTA)).toBe(problem);
  expect(emailProblem('@uta.edu', UTA)).toBe(problem);
});

test('an empty field asks for the address', () => {
  expect(emailProblem('   ', UTA)).toBe('Enter your UTA email address.');
  expect(emailProblem('', null)).toBe('Enter your UTA email address.');
});

test('without the domain list, the server decides', () => {
  expect(emailProblem('jane@gmail.com', null)).toBeNull();
});

test('reads a six-digit code, forgiving spaces and hyphens', () => {
  expect(typedCode('123456')).toBe('123456');
  expect(typedCode(' 123 456 ')).toBe('123456');
  expect(typedCode('123-456')).toBe('123456');
  expect(typedCode('12345')).toBeNull();
  expect(typedCode('12345a')).toBeNull();
  expect(typedCode('')).toBeNull();
});

test('counts down in minutes and seconds', () => {
  expect(formatCountdown(60)).toBe('1:00');
  expect(formatCountdown(42)).toBe('0:42');
  expect(formatCountdown(5.2)).toBe('0:06');
  expect(formatCountdown(-3)).toBe('0:00');
});
