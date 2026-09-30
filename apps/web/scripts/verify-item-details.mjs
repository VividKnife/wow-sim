// Run with serve-auction-preview.mjs; uses isolated preview data only.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.ITEM_DETAILS_URL||'http://127.0.0.1:5197';
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/item-details.html`);
  const inspect=page.getByRole('button',{name:'查看 测试补给 物品详情',exact:true});
  await inspect.tap();await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByLabel('已发送命令').textContent(),'[]');
  const bounds=await page.getByRole('dialog').boundingBox();
  assert(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y>=0&&bounds.y+bounds.height<=844);
  assert(await page.getByRole('dialog').evaluate(node=>{node.scrollTop=100;return node.scrollTop>0;}),'long details must scroll');
  await page.touchscreen.tap(5,5);await page.getByRole('dialog').waitFor({state:'hidden'});
  await inspect.tap();await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/· 购买/}).tap();
  assert.deepEqual(JSON.parse(await page.getByLabel('已发送命令').textContent()),[{type:'buy',id:117,count:1}]);
  await page.getByRole('button',{name:'出售',exact:true}).tap();
  await inspect.tap();await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('checkbox').isChecked(),false,'inspection must not select an item for sale');
  await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();
  await page.getByRole('checkbox').check();assert(await page.getByRole('checkbox').isChecked());
  await page.goto(`${base}/auction-house.html`);
  const first=page.locator('.ah-item-button').first();await first.tap();
  await page.getByRole('dialog').waitFor();assert.equal(await first.getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const desktop=await browser.newPage({viewport:{width:1280,height:900}});
  desktop.on('pageerror',error=>errors.push(error.message));
  await desktop.goto(`${base}/auction-house.html`);
  const target=desktop.locator('.ah-item-button').first();await target.hover();
  await desktop.getByRole('tooltip').waitFor();
  await target.focus();await desktop.keyboard.press('Enter');
  await desktop.getByRole('dialog').waitFor();
  assert.equal(await desktop.getByRole('tooltip').count(),0);
  await desktop.keyboard.press('Escape');await desktop.getByRole('dialog').waitFor({state:'hidden'});
  assert(await target.evaluate(node=>document.activeElement===node),'closing must restore keyboard focus');
  assert.deepEqual(errors,[]);console.log(`${name}: touch, scrolling, merchant commands, sale selection, auction selection, hover and keyboard passed`);
 }finally{await browser.close();}
}
