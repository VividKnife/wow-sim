// Run with the classic preview server on port 5198. All social traffic is isolated.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let sequence=30,failNext=false,sends=0;
const social={self:{id:'chat-preview',name:'艾琳',roles:['dps'],level:20},group:{id:'party-one',members:[{id:'chat-preview'},{id:'friend'}]},incoming:[],proposal:null,messages:{world:Array.from({length:30},(_,i)=>({id:i+1,at:Date.now()-(30-i)*60000,actorId:i%3?'friend':'chat-preview',name:i%3?'暮色旅人':'艾琳',classId:i%3?1:8,text:i===28?'有人一起去西部荒野吗？路上可以顺便做任务。':i===26?'这是一条很长的消息，用来验证手机下换行和阅读体验。'+ '长名字与消息内容不会撑破聊天窗口。'.repeat(5):'闪金镇的旅店见，一起出发吧。'})),party:[]}};
social.messages.world[27]={...social.messages.world[27],kind:'recruitment',actorId:'friend',name:'暮色旅人',classId:1,text:'暮色旅人正在寻找死亡矿井的队友',minimumLevel:17,maximumLevel:22,groupId:'another-party',recruitmentId:'recruit-1',open:true,needed:{tank:1,healer:1,dps:1}};
await page.route('**/api/game/social?*',async route=>{
 if(route.request().method()==='POST'){
  const body=route.request().postDataJSON();if(body.type==='chat'){sends++;if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'测试：暂时无法发送，请重试'}});}social.messages[body.channel].push({id:++sequence,at:Date.now(),actorId:'chat-preview',name:'艾琳',classId:8,text:body.text});}
 }
 await route.fulfill({json:social});
});
try{
 await page.goto('http://127.0.0.1:5198/classic-chat.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('input[aria-label="聊天消息"]')?.disabled===false);
 const input=page.getByRole('textbox',{name:'聊天消息'}),history=page.getByRole('log',{name:'世界聊天记录'});
 await input.fill('我也一起去，闪金镇见。');await page.getByRole('tab',{name:'队伍',exact:true}).click();await input.fill('队伍草稿');
 await page.getByRole('tab',{name:'世界',exact:true}).click();assert.equal(await input.inputValue(),'我也一起去，闪金镇见。');
 await page.getByRole('tab',{name:'综合',exact:true}).click();assert.ok(await page.locator('.cu-event-reward').count()>0);assert.equal(await page.locator('.cu-event-combat').count(),0);
 await page.getByRole('tab',{name:'世界',exact:true}).click();assert.equal(await input.inputValue(),'我也一起去，闪金镇见。');
 await input.dispatchEvent('compositionstart');await input.press('Enter');assert.equal(sends,0);await input.dispatchEvent('compositionend');
 failNext=true;await input.press('Enter');await page.getByRole('alert').filter({hasText:'测试：暂时无法发送'}).waitFor();assert.equal(await input.inputValue(),'我也一起去，闪金镇见。');
 await input.press('Enter');await page.waitForFunction(()=>document.querySelector('input[aria-label="聊天消息"]').value==='');
 await history.evaluate(node=>{node.scrollTop=0;node.dispatchEvent(new Event('scroll'));});
 social.messages.world.push({id:++sequence,at:Date.now(),actorId:'friend',name:'暮色旅人',classId:1,text:'我在旅店门口等你们，一起出发。'});
 await page.getByRole('button',{name:'1 条新消息',exact:true}).waitFor();assert.ok(await history.evaluate(node=>node.scrollTop)<10);
 await page.getByRole('button',{name:'1 条新消息',exact:true}).click();assert.ok(await history.evaluate(node=>node.scrollHeight-node.scrollTop-node.clientHeight)<2);
 assert.equal(await history.locator('.is-own strong').last().evaluate(node=>getComputedStyle(node).color),'rgb(105, 204, 239)');
 assert.equal(await history.locator('.social-message:not(.is-own) strong').last().evaluate(node=>getComputedStyle(node).color),'rgb(198, 155, 109)');
 await mkdir('/tmp/wow-chat-qa',{recursive:true});
 for(const [width,height] of [[1440,900],[1024,768],[390,844],[320,640],[844,390]]){
  await page.setViewportSize({width,height});
  await page.waitForTimeout(150);
  if(await page.getByRole('button',{name:'打开聊天与战报',exact:true}).isVisible())await page.getByRole('button',{name:'打开聊天与战报',exact:true}).click();
  await page.getByRole('tab',{name:'世界',exact:true}).click();
  const bounds=await page.locator('.cu-chat-window').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=height,`window bounds ${width}: ${JSON.stringify(bounds)}`);
  const overflow=await page.locator('.cu-chat-window').evaluate(node=>node.scrollWidth>node.clientWidth);assert.equal(overflow,false,`horizontal overflow at ${width}`);
  await page.screenshot({path:`/tmp/wow-chat-qa/chat-${width}.png`});
  if(width===390){await page.getByText('招募详情',{exact:true}).click();await page.getByRole('button',{name:'以输出加入',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/wow-chat-qa/chat-recruitment.png'});}
  await page.getByRole('tab',{name:'综合',exact:true}).click();
  await page.screenshot({path:`/tmp/wow-chat-qa/general-${width}.png`});
  await page.getByRole('tab',{name:'战斗详情',exact:true}).click();await page.getByRole('tab',{name:'战报',exact:true}).click();
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);if(await page.getByRole('button',{name:'打开聊天与战报',exact:true}).isVisible())await page.getByRole('button',{name:'打开聊天与战报',exact:true}).click();await page.getByRole('tab',{name:'世界',exact:true}).click();await input.focus();await input.press('Escape');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='打开聊天与战报');
 await page.getByRole('button',{name:'打开聊天与战报',exact:true}).click();await page.getByRole('button',{name:'打开伤害统计',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
 // Simulate the visual viewport shrinking when a mobile keyboard opens.
 await page.getByRole('tab',{name:'世界',exact:true}).click();
 await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:320});window.visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForTimeout(100);
 const keyboardBounds=await page.locator('.cu-chat-window').boundingBox();assert.ok(keyboardBounds.y>=0&&keyboardBounds.y+keyboardBounds.height<=320);const sendBounds=await page.getByRole('button',{name:'发送消息',exact:true}).boundingBox();assert.ok(sendBounds.y>=keyboardBounds.y&&sendBounds.y+sendBounds.height<=keyboardBounds.y+keyboardBounds.height,'keyboard must not clip the send button');
 await page.screenshot({path:'/tmp/wow-chat-qa/chat-keyboard.png'});
 await page.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'));});
 social.group=null;social.messages.party=[];
 await page.getByRole('tab',{name:'队伍',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cu-chat-content[data-state=active] input')?.disabled===true);await page.getByText('还没有加入队伍',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'世界',exact:true}).click();
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(150);
 const original=await page.locator('.cu-chat-window').boundingBox();await page.getByRole('button',{name:'移动聊天框',exact:true}).focus();await page.keyboard.press('ArrowRight');
 assert.equal((await page.locator('.cu-chat-window').boundingBox()).x,original.x+10);await page.keyboard.press('Home');assert.equal((await page.locator('.cu-chat-window').boundingBox()).x,original.x);
 await page.locator('.cu-viewport').evaluate(node=>node.classList.add('cu-in-combat'));assert.ok(await page.locator('.cu-chat-window').isVisible());
 await page.goto('http://127.0.0.1:5198/classic-chat.html?surface=web',{waitUntil:'domcontentloaded'});await page.getByRole('status').filter({hasText:'已连接'}).waitFor();
 for(const [width,height] of [[1440,900],[390,844]]){await page.setViewportSize({width,height});assert.equal(await page.locator('.social-chat').evaluate(node=>node.scrollWidth>node.clientWidth),false);await page.screenshot({path:`/tmp/wow-chat-qa/web-chat-${width}.png`});}
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile layout, drafts, IME, failed sends, scroll anchoring, event channels, collapse focus, meter dialog.');
}catch(error){console.error('Browser errors:',errors);await page.screenshot({path:'/tmp/chat-failure.png'});throw error;}finally{await browser.close();}
