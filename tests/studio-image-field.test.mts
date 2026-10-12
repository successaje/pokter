import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The rule the image field uses to decide whether it is showing one of the
 * avatars this form generated, or a URL the author typed.
 *
 * Mirrored here rather than imported because the component is a client
 * module. What matters is the distinction, and it got this wrong in a way
 * that silently hid a value the author had already entered.
 */
const SITE = 'https://pokter.xyz';
const GENERATED_AVATAR_PREFIX = `${SITE}/api/avatars/`;
const shown = (image: string) =>
  image.startsWith(GENERATED_AVATAR_PREFIX) ? '' : image;

test('a generated avatar leaves the custom field empty', () => {
  assert.equal(shown(`${SITE}/api/avatars/pokter-evidence?v=3`), '');
});

test('an image we host that is not an avatar stays visible', () => {
  const url = `${SITE}/agents/pokter-evidence.svg`;
  assert.equal(
    shown(url),
    url,
    'blanking this hid a URL the author had entered and let the next keystroke overwrite it',
  );
});

test('a third-party image stays visible', () => {
  const url = 'https://example.com/logo.png';
  assert.equal(shown(url), url);
});

test('an empty draft shows an empty field', () => {
  assert.equal(shown(''), '');
});
