import assert from 'node:assert/strict';
import test from 'node:test';

import { isPrivateAddress } from '../../src/lib/proof/prober';

/*
 * The guard every outside request goes through refuses any address that is
 * not on the public internet, in every spelling. Each range is listed once,
 * by the address a request would resolve to.
 */

const PRIVATE = [
  // IPv4
  '0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '100.127.255.255', '169.254.169.254', '172.16.0.1', '172.31.255.255',
  '192.168.1.1', '192.0.0.8', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9', '224.0.0.1', '255.255.255.255',
  // IPv6
  '::', '::1', '::7f00:1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'FE80::1', 'fec0::1', 'ff02::1', '2001:db8::1', '100::1',
  // IPv4 inside IPv6: mapped, NAT64, 6to4 and Teredo
  '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:a9fe:a9fe', '64:ff9b::a9fe:a9fe', '64:ff9b:1::a00:1', '2002:a9fe:a9fe::1', '2001:0:4136:e378::1',
];

const PUBLIC = ['1.1.1.1', '8.8.8.8', '104.16.132.229', '100.63.255.255', '100.128.0.1', '172.15.255.255', '172.32.0.1', '198.17.255.255', '198.20.0.1', '::ffff:1.1.1.1', '2606:4700::6810:84e5', '2a00:1450:4001:80b::200e', '2001:4860:4860::8888'];

test('addresses off the public internet are refused, in every spelling', () => {
  for (const address of PRIVATE) assert.equal(isPrivateAddress(address), true, address);
});

test('public addresses, including ones beside each private range, are allowed', () => {
  for (const address of PUBLIC) assert.equal(isPrivateAddress(address), false, address);
});
