import { strict as assert } from 'node:assert'
import { deviceNameFromUserAgent } from '../../lib/device'

assert.equal(
  deviceNameFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit Chrome/140 Safari/537.36'),
  'Windows computer · Chrome',
)
assert.equal(
  deviceNameFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18 Mobile Safari/604.1'),
  'iPhone · Safari',
)
assert.equal(
  deviceNameFromUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit Chrome/140 Mobile Safari/537.36'),
  'Android phone · Chrome',
)
assert.equal(
  deviceNameFromUserAgent('Mozilla/5.0 (X11; Linux x86_64) Gecko Firefox/140.0'),
  'Linux computer · Firefox',
)
assert.equal(deviceNameFromUserAgent(''), 'Computer · browser')

console.log('device labels: 5/5 passed')
