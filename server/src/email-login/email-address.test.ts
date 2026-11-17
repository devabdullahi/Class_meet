import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EMAIL_LOGIN_DOMAINS,
  displayNameFromEmail,
  normaliseUniversityEmail,
  parseEmailLoginDomains,
  redactEmailAddresses,
} from './email-address.js';

const normalise = (raw: unknown) => normaliseUniversityEmail(raw, DEFAULT_EMAIL_LOGIN_DOMAINS);

test('accepts student and staff addresses, trimmed and lowercased', () => {
  assert.equal(normalise('jane.doe@mavs.uta.edu'), 'jane.doe@mavs.uta.edu');
  assert.equal(normalise('  Jane.Doe@MAVS.UTA.EDU '), 'jane.doe@mavs.uta.edu');
  assert.equal(normalise('prof_smith@uta.edu'), 'prof_smith@uta.edu');
  assert.equal(normalise('abc1234@mavs.uta.edu'), 'abc1234@mavs.uta.edu');
});

test('strips a plus tag, so one mailbox is one account', () => {
  assert.equal(normalise('jane+classmeet@mavs.uta.edu'), 'jane@mavs.uta.edu');
  assert.equal(normalise('jane+@uta.edu'), 'jane@uta.edu');
});

test('refuses any other domain, including ones that merely contain a UTA domain', () => {
  for (const address of [
    'jane@gmail.com',
    'jane@mavs.uta.edu.evil.com',
    'jane@evilmavs.uta.edu',
    'jane@sub.mavs.uta.edu',
    'jane@uta.edu.',
    'jane@uta.education',
    'jane@mavs.uta.edu@evil.com',
  ]) {
    assert.equal(normalise(address), null, address);
  }
});

test('refuses things that are not plain addresses', () => {
  for (const value of [
    '',
    '@mavs.uta.edu',
    'jane',
    'jane doe@mavs.uta.edu',
    '"jane"@mavs.uta.edu',
    'jane\r\nBcc: x@evil.com@mavs.uta.edu',
    `${'a'.repeat(65)}@mavs.uta.edu`,
    `${'a'.repeat(250)}@uta.edu`,
    42,
    null,
    undefined,
    { email: 'jane@uta.edu' },
  ]) {
    assert.equal(normalise(value), null, JSON.stringify(value));
  }
});

test('honours a configured domain list', () => {
  assert.equal(normaliseUniversityEmail('sam@example.edu', ['example.edu']), 'sam@example.edu');
  assert.equal(normaliseUniversityEmail('sam@mavs.uta.edu', ['example.edu']), null);
});

test('reads EMAIL_LOGIN_DOMAINS, and refuses a malformed list', () => {
  assert.deepEqual(parseEmailLoginDomains('mavs.uta.edu, UTA.edu ,'), ['mavs.uta.edu', 'uta.edu']);
  assert.deepEqual(parseEmailLoginDomains('@uta.edu'), ['uta.edu']);
  assert.throws(() => parseEmailLoginDomains(' , '), /at least one domain/);
  assert.throws(() => parseEmailLoginDomains('uta'), /not a domain name/);
  assert.throws(() => parseEmailLoginDomains('uta.edu/evil'), /not a domain name/);
});

test('makes a readable name from the address', () => {
  assert.equal(displayNameFromEmail('jane.doe@mavs.uta.edu'), 'Jane Doe');
  assert.equal(displayNameFromEmail('mary-kate_o.neil@uta.edu'), 'Mary Kate O Neil');
  assert.equal(displayNameFromEmail('abc1234@mavs.uta.edu'), 'Abc1234');
  assert.equal(displayNameFromEmail('...@uta.edu'), '...');
});

test('redacts every email address from a log line, and nothing else', () => {
  assert.equal(
    redactEmailAddresses('550 5.1.1 <jane.doe@mavs.uta.edu>: Recipient address rejected; from "a+b@gmail.com".'),
    '550 5.1.1 <[address]>: Recipient address rejected; from "[address]".',
  );
  assert.equal(redactEmailAddresses('connect ETIMEDOUT 142.250.1.1:465'), 'connect ETIMEDOUT 142.250.1.1:465');
});
