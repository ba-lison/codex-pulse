import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPanelData } from './panel-data.mjs';

test('selects Codex, preserves consumption and the full reset timestamp', () => {
  const data = toPanelData({rateLimitsByLimitId:{other:{primary:{usedPercent:80}},codex:{planType:'plus',primary:{usedPercent:3.5,resetsAt:1792328880,windowDurationMins:300},secondary:{usedPercent:0}}}});
  assert.equal(data.plan,'Plus');
  assert.equal(data.windows[0].usedPercent,3.5);
  assert.equal(data.windows[0].remainingPercent,96.5);
  assert.equal(Date.parse(data.windows[0].resetsAt),1792328880000);
  assert.equal(data.windows[0].windowDurationMins,300);
  assert.equal(data.windows.length,1);
});
test('missing or nonfinite values remain unavailable, never 100% available', () => {
  for(const usedPercent of [undefined,null,NaN,Infinity,'0']){
    const data=toPanelData({rateLimits:{primary:{usedPercent,resetsAt:null}}});
    assert.equal(data.windows[0].remainingPercent,null);
    assert.equal(data.windows[0].resetsAt,null);
    assert.equal(data.windows.length,1);
  }
});
test('clamps percentages and rejects unrelated-only limits',()=>{
  const data=toPanelData({rateLimits:{primary:{usedPercent:-2},secondary:{usedPercent:110}}});
  assert.deepEqual(data.windows.map(w=>w.remainingPercent),[100]);
  assert.throws(()=>toPanelData({rateLimitsByLimitId:{other:{}}}),/Codex/);
});
