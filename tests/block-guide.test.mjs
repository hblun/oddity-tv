import test from 'node:test';
import assert from 'node:assert/strict';
import {blockScale,blockState,offsetText} from '../web/block-guide.js';

test('the default guide window is three hours for every block',()=>{
  assert.deepEqual(blockScale([{kind:'block',start:0,end:10800}]),{span:10800,tick:1800});
  assert.deepEqual(blockScale([{kind:'block',start:0,end:114}]),{span:10800,tick:1800});
});
test('unscheduled previews cannot acquire a live state and offsets are not clock times',()=>{
  assert.equal(blockState({scheduled:false},100),'Programme block');
  assert.equal(blockState({scheduled:true,start:10,end:20},10),'On air');
  assert.equal(blockState({scheduled:true,start:10,end:20},20),'Earlier');
  assert.equal(offsetText(1500),'+00:25');
  assert.equal(offsetText(10560),'+02:56');
});
