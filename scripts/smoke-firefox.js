import { createServer } from "node:http";
import { cp, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import path from "node:path";
const dir = path.resolve(`build/smoke-${Date.now()}`);
await mkdir(dir, { recursive: true });
await cp("build/firefox", dir, { recursive: true });
let resolveReport;
const report = new Promise((resolve) => (resolveReport = resolve));
const server = createServer((req, res) => {
  if (req.url === "/test-favicon.png") {
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
    res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
    return;
  }
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<!doctype html><title>Tavvy smoke tab</title>Tab");
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    res.end("ok");
    try {
      resolveReport(JSON.parse(body));
    } catch {
      resolveReport({ ok: false, error: body });
    }
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const manifest = JSON.parse(await readFile(`${dir}/manifest.json`, "utf8"));
manifest.host_permissions = ["http://127.0.0.1/*"];
// The isolated smoke profile grants the optional container permission for testing.
manifest.permissions.push("cookies");
delete manifest.optional_permissions;
// The smoke harness reports its result to a local test server.
manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages.replace("connect-src 'none'", "connect-src http://127.0.0.1:*");
await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest));
await writeFile(
  `${dir}/background.js`,
  (await readFile(`${dir}/background.js`, "utf8")) +
    '\nbrowser.runtime.onInstalled.addListener(() => browser.tabs.create({url:browser.runtime.getURL("smoke.html")}));',
);
await writeFile(
  `${dir}/smoke.html`,
  '<!doctype html><meta charset="utf-8"><script src="smoke.js"></script>',
);
await build({
  stdin: {
    contents: `
(async () => {
 const results=[];
 function check(value,label){if(!value)throw new Error(label);results.push(label);}
 try {
 const loadedIcon = await new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = 'http://127.0.0.1:${port}/test-favicon.png'; });
 check(loadedIcon,'remote favicon loads in extension page');
 for(const icon of ['fingerprint']){const loaded=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src='resource://usercontext-content/'+icon+'.svg';});check(loaded,'Firefox container icon loads: '+icon);}
 const {id:windowId}=await browser.windows.getCurrent();
 async function command(command){ const result=await browser.runtime.sendMessage({channel:'tavvy-command',windowId,command});if(!result?.ok)throw new Error(result?.error || 'No background response');return result.snapshot; }
 const smokeBeforeConsent=await browser.tabs.getCurrent();
 const beforeConsent=await browser.tabs.create({windowId,active:false,url:'about:blank'});
 const closedBeforeConsent=await browser.tabs.create({windowId,active:false,url:'about:blank'});
 await browser.tabs.update(beforeConsent.id,{active:true});
 await browser.tabs.move(beforeConsent.id,{index:0});
 await browser.tabs.remove(closedBeforeConsent.id);
 await browser.tabs.update(smokeBeforeConsent.id,{active:true});
 await new Promise(resolve=>setTimeout(resolve,300));
 const rejected=await browser.runtime.sendMessage({channel:'tavvy-command',windowId,command:{type:'snapshot'}});
 check(rejected?.ok===false,'background rejects commands before onboarding');
 check((await browser.sessions.getTabValue(beforeConsent.id,'tavvy:group'))===undefined,'tabs remain unassigned before onboarding');
 check(!(await browser.tabs.get(beforeConsent.id)).hidden,'tabs stay visible before onboarding');
 check(!(await browser.storage.local.get('tavvy:workspace:v1'))['tavvy:workspace:v1'],'workspace is not initialized before onboarding');
 check(!(await browser.alarms.get('tavvy-backup')),'backup is not scheduled before onboarding');
 const frame=document.createElement('iframe');frame.style.width='440px';frame.style.height='300px';frame.src=browser.runtime.getURL('popup.html');document.documentElement.append(frame);
 for(let attempt=0;attempt<100&&!frame.contentDocument?.querySelector('.compatibility-notice button');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 const notice=frame.contentDocument.querySelector('.compatibility-notice');check(Boolean(notice),'first launch shows compatibility notice');
 check(!frame.contentDocument.querySelector('.group-header'),'groups are unavailable before acknowledgement');
 const noticeLanguage=notice.querySelector('select');noticeLanguage.value='ru';noticeLanguage.dispatchEvent(new Event('change'));
 check(notice.querySelector('h1').textContent==='Прежде чем начать'&&notice.querySelector('button').textContent==='Понятно','notice language updates immediately');
 const noticeHeight=frame.contentDocument.querySelector('.popup').getBoundingClientRect().height;
 const noticeBounds=notice.getBoundingClientRect();const popupStyle=frame.contentWindow.getComputedStyle(frame.contentDocument.querySelector('.popup'));
 check(Math.abs(noticeHeight-noticeBounds.height-parseFloat(popupStyle.paddingTop)-parseFloat(popupStyle.paddingBottom))<1,'notice popup fits its content');
 notice.querySelector('button').click();
 for(let attempt=0;attempt<100&&!frame.contentDocument?.querySelector('.group-header');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 const ui=frame.contentDocument;check(Boolean(ui.querySelector('.group-header')),'live popup renders');
 check((await command({type:'snapshot'})).settings.language==='ru'&&ui.documentElement.lang==='ru','notice language persists in settings');
 check(ui.querySelector('.popup').getBoundingClientRect().height>noticeHeight,'normal popup height is restored after acknowledgement');
 check((await browser.storage.local.get('tavvy:tab-manager-notice:v1'))['tavvy:tab-manager-notice:v1']===true,'notice acknowledgement is saved');
 const reopened=document.createElement('iframe');reopened.src=browser.runtime.getURL('popup.html');document.documentElement.append(reopened);
 for(let attempt=0;attempt<100&&!reopened.contentDocument?.querySelector('.group-header');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 check(Boolean(reopened.contentDocument.querySelector('.group-header'))&&!reopened.contentDocument.querySelector('.compatibility-notice'),'notice is not shown after reopening');reopened.remove();
 const iconCanvas=document.createElement('canvas');iconCanvas.width=iconCanvas.height=32;iconCanvas.getContext('2d').fillRect(0,0,16,16);
 await new Promise((resolve,reject)=>browser.menus.create({id:'smoke-menu-icon',parentId:'tavvy-move-tab',title:'Smoke marker',contexts:['tab'],icons:{32:iconCanvas.toDataURL('image/png')}},()=>browser.runtime.lastError?reject(new Error(browser.runtime.lastError.message)):resolve()));
 check(true,'Firefox accepts generated menu marker');await browser.menus.remove('smoke-menu-icon');
 let state=await command({type:'snapshot'});check(state.groups.some(g=>g.id==='inbox'),'background snapshot');
 const sample=await browser.tabs.create({url:'http://127.0.0.1:${port}/sample',active:false});
 for(let attempt=0;attempt<100;attempt++){const current=await browser.tabs.get(sample.id);if(current.status==='complete'&&current.url.includes('/sample'))break;await new Promise(resolve=>setTimeout(resolve,50));}
 await browser.tabs.update(sample.id,{muted:true});await new Promise(resolve=>setTimeout(resolve,100));
 await command({type:'toggleTabMute',tabId:sample.id});check(!(await browser.tabs.get(sample.id)).mutedInfo.muted,'tab unmute command changes Firefox state');
 await command({type:'toggleTabMute',tabId:sample.id});check(!(await browser.tabs.get(sample.id)).mutedInfo.muted,'silent unmuted tab stays unmuted');
 const pinned=await browser.tabs.create({url:'about:blank',active:false,pinned:true});
 state=await command({type:'createGroup',title:'Firefox smoke'});const groupId=state.groups.find(g=>g.title==='Firefox smoke').id;
 await command({type:'moveTab',tabId:sample.id,groupId});
 state=await command({type:'activateGroup',groupId});check(state.activeGroupId===groupId,'group activation');check((await browser.action.getTitle({windowId})).includes('Firefox smoke'),'toolbar follows active group');
 check(!(await browser.tabs.get(sample.id)).hidden,'target tab is visible');check(!(await browser.tabs.get(pinned.id)).hidden,'pinned tab remains visible');
 state=await command({type:'saveSettings',settings:{...state.settings,groupPinnedTabs:true}});
 await command({type:'activateGroup',groupId:'inbox'});let actualPin=await browser.tabs.get(pinned.id);check(!actualPin.pinned && actualPin.hidden,'grouped pinned tab is hidden after unpinning');
 await command({type:'activateGroup',groupId});actualPin=await browser.tabs.get(pinned.id);check(actualPin.pinned && !actualPin.hidden,'grouped pinned tab is restored on return');
 await command({type:'activateGroup',groupId:'inbox'});state=await command({type:'snapshot'});await command({type:'saveSettings',settings:{...state.settings,groupPinnedTabs:false}});actualPin=await browser.tabs.get(pinned.id);check(actualPin.pinned && !actualPin.hidden,'disabling grouping restores pinned tabs');
 await command({type:'activateGroup',groupId});
 state=await command({type:'closeTab',tabId:sample.id});check(!state.tabs.some(t=>t.id===sample.id),'real tab is closed');
 const replacementTab=await browser.tabs.create({url:'http://127.0.0.1:${port}/sample',active:false});
 await command({type:'moveTab',tabId:replacementTab.id,groupId});
 await command({type:'saveSettings',settings:{theme:'Тёмная',animations:false}});state=await command({type:'snapshot'});check(state.settings.animations===false,'settings persisted in Firefox storage');
 state=await command({type:'deleteGroup',groupId});check(!state.groups.some(g=>g.id===groupId),'group deletion');check(!state.tabs.some(t=>t.id===replacementTab.id),'group deletion closes its tabs by default');
 state=await command({type:'createGroup',title:'Visibility parent'});const visibilityParent=state.groups.find(g=>g.title==='Visibility parent').id;
 await command({type:'activateGroup',groupId:visibilityParent});state=await command({type:'snapshot'});const parentTab=state.tabs.find(t=>t.groupId===visibilityParent).id;
 state=await command({type:'createGroup',title:'Visibility child',parentId:visibilityParent});const visibilityChild=state.groups.find(g=>g.title==='Visibility child').id;
 await command({type:'activateGroup',groupId:visibilityChild});state=await command({type:'snapshot'});const childTab=state.tabs.find(t=>t.groupId===visibilityChild).id;
 check(!(await browser.tabs.get(parentTab)).hidden,'parent mode shows ancestor tabs');
 state=await command({type:'saveSettings',settings:{...state.settings,nestedTabsVisibility:'children'}});check((await browser.tabs.get(parentTab)).hidden,'child mode hides ancestor tabs');
 await command({type:'activateGroup',groupId:visibilityParent});check(!(await browser.tabs.get(childTab)).hidden,'child mode shows descendant tabs');
 state=await command({type:'snapshot'});state=await command({type:'saveSettings',settings:{...state.settings,nestedGroups:false}});check((await browser.tabs.get(childTab)).hidden,'disabled nesting isolates group tabs');check(state.groups.find(g=>g.id===visibilityChild).parentId===visibilityParent,'disabled nesting preserves hierarchy');
 state=await command({type:'saveSettings',settings:{...state.settings,nestedGroups:true,nestedTabsVisibility:'parents'}});await command({type:'deleteGroup',groupId:visibilityChild});await command({type:'deleteGroup',groupId:visibilityParent});

 check(!ui.body.textContent.includes('Глубокое обучение'),'popup uses live data, not fixtures');
 let retainedGroup=ui.querySelector('.group'); let retainedMarker=retainedGroup.querySelector('.marker');
 ui.querySelector('.settings-button').click();
 let settingsTab;for(let attempt=0;attempt<100;attempt++){settingsTab=(await browser.tabs.query({})).find(tab=>tab.url?.includes('/settings.html'));if(settingsTab)break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(Boolean(settingsTab),'settings opens in a separate tab');
 const settingsFrame=document.createElement('iframe');settingsFrame.style.width='1200px';settingsFrame.style.height='900px';settingsFrame.src=settingsTab.url;document.documentElement.append(settingsFrame);
 for(let attempt=0;attempt<100&&!settingsFrame.contentDocument?.querySelector('.theme-open');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 const settingsUi=settingsFrame.contentDocument;
 for(let attempt=0;attempt<100&&settingsUi.querySelector('.settings-view').hidden;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 check(!settingsUi.querySelector('.settings-view').hidden,'settings page shows settings');
 check(!settingsUi.querySelector('#settings-data-title'),'settings page has no empty data section');
 check(!settingsUi.querySelector('.settings-tabs')&&!settingsUi.querySelector('.settings-preview'),'settings page has no tabs or preview');
 const settingsGrid=settingsUi.querySelector('.settings-view');
 check(settingsFrame.contentWindow.getComputedStyle(settingsGrid).gridTemplateColumns.split(' ').length===2,'settings use two columns on wide screens');
 check(settingsUi.querySelectorAll('.settings-column').length===2,'settings sections use independent columns');
 check(!settingsUi.querySelector('.settings-backups').hidden,'backup section is on the settings page');
 const themeSelect=settingsUi.querySelector('select[data-i18n-aria-label="settings.theme.title"]');
 check(Boolean(themeSelect),'theme uses a select on the settings page');
 themeSelect.value='Чёрная';themeSelect.dispatchEvent(new Event('change',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,350));
 check(settingsFrame.contentWindow.getComputedStyle(settingsUi.body).backgroundColor==='rgb(0, 0, 0)','black theme uses a black settings background');
 for(const name of ['import.html','local-file.html']){
  const colorFrame=document.createElement('iframe');colorFrame.src=browser.runtime.getURL(name);document.documentElement.append(colorFrame);
  for(let attempt=0;attempt<100&&colorFrame.contentDocument?.documentElement.dataset.theme!=='black';attempt++)await new Promise(resolve=>setTimeout(resolve,50));
  check(colorFrame.contentWindow.getComputedStyle(colorFrame.contentDocument.documentElement).backgroundColor==='rgb(0, 0, 0)','black theme uses black on '+name);colorFrame.remove();
 }
 themeSelect.value='Светлая';themeSelect.dispatchEvent(new Event('change',{bubbles:true}));
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.settings.theme==='Светлая')break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.settings.theme==='Светлая','popup settings reach background');
 const languageSelect=settingsUi.querySelector('select[data-i18n-aria-label="settings.language"]');
 check(Boolean(languageSelect),'language uses a select on the settings page');
 languageSelect.value='fr';languageSelect.dispatchEvent(new Event('change',{bubbles:true}));
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.settings.language==='fr')break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.settings.language==='fr'&&settingsUi.documentElement.lang==='fr','language page persists selected language');
 languageSelect.value='ru';languageSelect.dispatchEvent(new Event('change',{bubbles:true}));
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.settings.language==='ru')break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(!settingsUi.querySelector('.settings-view').hidden&&!settingsUi.querySelector('.settings-backups').hidden,'theme and language changes stay on settings page');
 settingsFrame.style.width='320px';
 check(settingsFrame.contentWindow.getComputedStyle(settingsGrid).gridTemplateColumns.split(' ').length===1,'settings use one column on narrow screens');
 settingsFrame.style.width='720px';
 check(!settingsUi.querySelector('.accent-setting'),'accent color control is removed');
 check(!settingsUi.querySelector('.experimental-spaces'),'spaces no longer require a global setting');
 check(!ui.querySelector('.spaces-bar'),'global space switcher is removed');
 const smokeIdentity=await browser.contextualIdentities.create({name:'Smoke workspace',icon:'fingerprint',color:'blue'});
 state=await command({type:'createGroup',title:'Smoke workspace'});
 const smokeGroup=state.groups.find(item=>item.title==='Smoke workspace').id;
 state=await command({type:'moveGroupToSpace',groupId:smokeGroup,spaceId:'container:'+smokeIdentity.cookieStoreId});
 const smokeSpace=state.groups.find(item=>item.id===smokeGroup).spaceId;
 state=await command({type:'activateGroup',groupId:smokeGroup});
 const spaceTab=state.tabs.find(tab=>tab.active);const realSpaceTab=await browser.tabs.get(spaceTab.id);
 check(realSpaceTab.cookieStoreId===smokeIdentity.cookieStoreId,'group tab uses its Firefox container');
 const normalNewTab=await browser.tabs.create({windowId,active:true,cookieStoreId:'firefox-default'});
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.tabs.some(tab=>tab.active&&tab.id!==normalNewTab.id&&tab.groupId===smokeGroup&&tab.cookieStoreId===smokeIdentity.cookieStoreId))break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.activeGroupId===smokeGroup&&state.tabs.some(tab=>tab.active&&tab.id!==normalNewTab.id&&tab.groupId===smokeGroup&&tab.cookieStoreId===smokeIdentity.cookieStoreId),'ordinary new tab stays in the active container group');
 for(let attempt=0;attempt<100&&!ui.querySelector('[data-group-id="'+smokeGroup+'"] .group-space-label:not([hidden])');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 const spaceLabel=ui.querySelector('[data-group-id="'+smokeGroup+'"] .group-space-label');
 check(Boolean(spaceLabel)&&spaceLabel.textContent===''&&spaceLabel.title==='Smoke workspace','group displays only its container icon');
 check(Boolean(ui.querySelector('[data-group-id="inbox"]')),'groups in other containers remain visible');
 check(spaceLabel.nextElementSibling.classList.contains('group-toggle'),'container icon precedes tab counter');
 spaceLabel.click();
 check(Boolean(ui.querySelector('.group-context-item.is-current')),'container picker highlights current container');
 check(!ui.querySelector('.group-container-edit'),'container icon editing is unavailable');
 spaceLabel.click();
 await browser.cookies.set({url:'http://127.0.0.1:${port}/',name:'tavvy-space-isolation',value:'work',storeId:realSpaceTab.cookieStoreId});
 check((await browser.cookies.get({url:'http://127.0.0.1:${port}/',name:'tavvy-space-isolation',storeId:realSpaceTab.cookieStoreId}))?.value==='work','space cookie is stored in its container');
 check(!(await browser.cookies.get({url:'http://127.0.0.1:${port}/',name:'tavvy-space-isolation',storeId:'firefox-default'})),'space cookie is isolated from default');
 state=await command({type:'activateGroup',groupId:'inbox'});
 check(state.groups.some(item=>item.id==='inbox')&&state.groups.some(item=>item.id===smokeGroup),'all groups remain in a shared tree');
 retainedGroup=ui.querySelector('.group');retainedMarker=retainedGroup.querySelector('.marker');
 ui.querySelector('.create-group').click();ui.querySelector('.new-group-form input').value='UI group';ui.querySelector('.new-group-form').dispatchEvent(new Event('submit',{cancelable:true}));
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.groups.some(g=>g.title==='UI group'))break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.groups.some(g=>g.title==='UI group'),'popup creates real group');
 await new Promise(resolve=>setTimeout(resolve,250)); check(retainedGroup.isConnected && retainedMarker.isConnected,'background updates preserve existing cards and markers');
 const parentId=state.groups.find(group=>group.title==='UI group').id;
 state=await command({type:'createGroup',title:'Nested UI group',parentId});
 for(let attempt=0;attempt<100&&!ui.querySelector('[data-group-id="'+parentId+'"] .subgroups .group-toggle');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 const parent=ui.querySelector('[data-group-id="'+parentId+'"]');const children=parent.querySelector(':scope > .subgroups');const parentToggle=parent.querySelector(':scope > .group-controls .group-toggle');
 check(frame.contentWindow.getComputedStyle(children).display==='none','nested groups are hidden when parent is collapsed');
 parentToggle.click();check(frame.contentWindow.getComputedStyle(children).display!=='none','nested groups appear when parent opens');
 const childToggle=children.querySelector('.group-toggle');childToggle.click();check(parentToggle.getAttribute('aria-expanded')==='true','opening nested group keeps parent open');
 parentToggle.click();check(frame.contentWindow.getComputedStyle(children).display==='none','closing parent hides nested groups');


 const backup={version:'5.3.2',groups:[{id:1,title:'Imported empty',iconColor:'#ff7800',tabs:[]},{id:2,title:'Imported tabs',iconColor:'#398dff',tabs:[{url:'http://127.0.0.1:${port}/imported',title:'Imported page'},{url:'file:///D:/smoke.pdf',title:'Imported file'},{url:'about:addons',title:'Add-ons'}]}],pinnedTabs:[{url:'http://127.0.0.1:${port}/pinned',title:'Imported pinned'}]};

 check(!settingsUi.querySelector('.settings-backups').hidden,'backup controls remain visible on settings page');
 const dropzone=settingsUi.querySelector('.backup-dropzone'),restoreSubmit=settingsUi.querySelector('.backup-restore-submit');
 check(Boolean(dropzone)&&restoreSubmit.disabled,'backup drop zone waits for a file');
 const dropBackup={version:'5.3.2',groups:[{id:87654,title:'Dropped backup group',tabs:[{url:'http://127.0.0.1:${port}/dropped',title:'Dropped page'}]}]};
 const transfer=new settingsFrame.contentWindow.DataTransfer();transfer.items.add(new settingsFrame.contentWindow.File([JSON.stringify(dropBackup)],'drop-test.json',{type:'application/json'}));
 dropzone.dispatchEvent(new settingsFrame.contentWindow.DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
 for(let attempt=0;attempt<100&&restoreSubmit.disabled;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
 check(!restoreSubmit.disabled&&settingsUi.querySelector('.backup-dropzone-filename').textContent==='drop-test.json','dropped backup is selected');
 check(!settingsUi.querySelector('.backup-file-summary').hidden&&settingsUi.querySelector('.backup-file-counts').textContent.includes('1')&&settingsUi.querySelector('.backup-file-groups').textContent.includes('Dropped backup group'),'backup contents are summarized before restore');
 check(!(await command({type:'snapshot'})).groups.some(g=>g.title==='Dropped backup group'),'dropping a file does not restore without confirmation');
 settingsUi.querySelector('.backup-close-existing').checked=false;restoreSubmit.click();
 check(settingsUi.querySelector('.backup-file-summary').hidden,'backup preview hides when restore starts');
 for(let attempt=0;attempt<200;attempt++){state=await command({type:'snapshot'});if(state.groups.some(g=>g.title==='Dropped backup group'))break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.groups.some(g=>g.title==='Dropped backup group'),'dropped backup restores from settings');
 for(let attempt=0;attempt<100&&restoreSubmit.disabled;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 check(!restoreSubmit.disabled&&settingsUi.querySelector('.backup-restore-status').dataset.error==='false','drop restore completes successfully');
 settingsUi.querySelector('.backup-import').click();
 let importTab;
 for(let attempt=0;attempt<100;attempt++){importTab=(await browser.tabs.query({windowId})).find(tab=>tab.url?.includes('/import.html'));if(importTab)break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(Boolean(importTab),'import button opens a persistent import page');
 const importFrame=document.createElement('iframe');importFrame.src=importTab.url;document.documentElement.append(importFrame);
 for(let attempt=0;attempt<100&&!importFrame.contentDocument?.querySelector('input[type=file]');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 importFrame.contentDocument.querySelector('#close-existing').checked=false;
 const backupFile=new importFrame.contentWindow.File([JSON.stringify(backup)],'stg.json',{type:'application/json'});
 const importer=importFrame.contentDocument.querySelector('input[type=file]');Object.defineProperty(importer,'files',{configurable:true,value:[backupFile]});importer.dispatchEvent(new Event('change'));
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.importReport?.groups===2)break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.importReport.groups===2 && state.importReport.tabs===3 && state.importReport.browserPages===1,'existing import button recognizes STG backups');
 check(state.tabs.some(t=>t.url.includes('local-file.html')),'local-file links preserved as explanatory tabs');
 const browserPage=state.tabs.find(t=>t.url.includes('local-file.html#')&&JSON.parse(decodeURIComponent(t.url.split('#')[1])).url==='about:addons');check(Boolean(browserPage),'browser page preserved as explanatory tab');
 const pageFrame=document.createElement('iframe');pageFrame.src=browserPage.url;document.documentElement.append(pageFrame);
 for(let attempt=0;attempt<100&&!pageFrame.contentDocument?.querySelector('input')?.value;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 check(pageFrame.contentDocument.querySelector('input').value==='about:addons','browser page shows original address');pageFrame.remove();
 state=await command({type:'importStg',backup});check(state.groups.some(item=>item.title==='Imported tabs'),'reimport restores groups');

 const second=await browser.windows.create({url:'http://127.0.0.1:${port}/discard',focused:false});
 const previousId=second.tabs[0].id;
 for(let attempt=0;attempt<100;attempt++){const tab=await browser.tabs.get(previousId);if(tab.status==='complete'&&tab.url.includes('/discard'))break;await new Promise(resolve=>setTimeout(resolve,50));}
 async function secondCommand(cmd){const result=await browser.runtime.sendMessage({channel:'tavvy-command',windowId:second.id,command:cmd});if(!result?.ok)throw new Error(result?.error||'No response');return result.snapshot;}
 await secondCommand({type:'saveSettings',settings:{theme:'Чёрная',animations:true,discardInactiveTabs:true}});
 let secondState=await secondCommand({type:'createGroup',title:'Discard test'});const nextGroup=secondState.groups.find(group=>group.title==='Discard test').id;
 await secondCommand({type:'activateGroup',groupId:nextGroup});
 check((await browser.tabs.get(previousId)).discarded===true,'silent inactive tab is unloaded in Firefox');
 await secondCommand({type:'activateGroup',groupId:'inbox'});
 check((await browser.tabs.get(previousId)).discarded===false,'tab reloads after returning to its group');
 await browser.windows.remove(second.id);

 const restoreBackup={format:'tavvy-backup',version:2,groups:[{id:'inbox',title:'Main',color:'#398dff',parentId:null},{id:'backup-work',title:'Restored work',color:'#398dff',parentId:null,spaceId:'backup-space'}],spaces:[{id:'backup-space',name:'Restored space'}],tabs:[{groupId:'backup-work',title:'Restored',url:'http://127.0.0.1:${port}/restored',pinned:false},{groupId:'backup-work',title:'Local',url:'file:///D:/workspace-smoke.pdf',pinned:false}],archive:[],settings:state.settings};
 const restoreIdentity=await browser.contextualIdentities.create({name:'Restored space',icon:'fingerprint',color:'blue'});
 state=await command({type:'importBackup',backup:restoreBackup});const restoredSpace=state.spaces.find(item=>item.name==='Restored space');check(Boolean(restoredSpace),'workspace backup restores space');
 state=await command({type:'activateSpace',spaceId:restoredSpace.id});let restoredTab=state.tabs.find(tab=>tab.url.includes('/restored'));for(let attempt=0;attempt<100&&!restoredTab;attempt++){await new Promise(resolve=>setTimeout(resolve,50));state=await command({type:'snapshot'});restoredTab=state.tabs.find(tab=>tab.url.includes('/restored'));}check(Boolean(restoredTab),'workspace backup restores its tab');
 const restoredReal=await browser.tabs.get(restoredTab.id);check(restoredReal.cookieStoreId===restoreIdentity.cookieStoreId,'workspace backup uses an existing container');
 const restoredLocal=state.tabs.find(tab=>tab.groupId===restoredTab.groupId&&tab.url.includes('/local-file.html#'));check(Boolean(restoredLocal),'workspace backup preserves local-file link');check((await browser.tabs.get(restoredLocal.id)).cookieStoreId===restoredReal.cookieStoreId,'local-file explanation stays in the workspace container');
 await command({type:'activateSpace',spaceId:'default'});
 const missingIdentity=await browser.contextualIdentities.create({name:'Missing smoke container',icon:'fingerprint',color:'blue'});
 state=await command({type:'activateSpace',spaceId:'container:'+missingIdentity.cookieStoreId});const missingSpace=state.activeSpaceId;
 await command({type:'createGroup',title:'Recovered smoke group',spaceId:missingSpace});await command({type:'activateSpace',spaceId:'default'});
 await browser.contextualIdentities.remove(missingIdentity.cookieStoreId);
 const replacement=await browser.contextualIdentities.create({name:'Existing smoke replacement',icon:'tree',color:'blue'});
 state=await command({type:'snapshot'});check(state.spaces.find(item=>item.id===missingSpace)?.unavailable,'removed container is marked unavailable');
 const recoveredGroup=state.groups.find(item=>item.title==='Recovered smoke group');
 for(let attempt=0;attempt<100&&!ui.querySelector('[data-group-id="'+recoveredGroup.id+'"]');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 ui.querySelector('[data-group-id="'+recoveredGroup.id+'"] > .group-controls').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
 const rebind=ui.querySelector('.group-context-move');check(Boolean(rebind),'missing space offers reconnection');rebind.click();
 const replacementOption=[...ui.querySelectorAll('.group-context-submenu [role="menuitem"]')].find(item=>item.textContent.includes('Existing smoke replacement')&&item.textContent!=='Existing smoke replacement');
 check(Boolean(replacementOption),'missing space offers existing Firefox containers');replacementOption.click();
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.activeSpaceId===missingSpace)break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.activeSpaceId===missingSpace&&state.groups.some(item=>item.title==='Recovered smoke group'),'reconnecting preserves space groups');
 state=await command({type:'createTab',groupId:state.activeGroupId});
 check(state.tabs.some(item=>item.cookieStoreId===replacement.cookieStoreId),'reconnected space uses selected Firefox container');
 await command({type:'activateSpace',spaceId:'default'});
 state=await command({type:'createGroup',title:'Move smoke group'});
 const movedSmokeGroup=state.groups.find(item=>item.title==='Move smoke group').id;
 state=await command({type:'createGroup',title:'Move smoke child',parentId:movedSmokeGroup});
 const movedSmokeChild=state.groups.find(item=>item.title==='Move smoke child').id;
 state=await command({type:'createTab',groupId:movedSmokeGroup});
 state=await command({type:'moveGroupToSpace',groupId:movedSmokeGroup,spaceId:'container:'+smokeIdentity.cookieStoreId});
 check(state.activeGroupId===movedSmokeGroup&&state.groups.find(item=>item.id===movedSmokeChild)?.parentId===movedSmokeGroup&&!state.groups.find(item=>item.id===movedSmokeChild)?.spaceId,'changing a group container preserves its active group and child container');
 state=await command({type:'activateSpace',spaceId:state.spaces.find(item=>item.name==='Smoke workspace').id});
 check(state.groups.some(item=>item.id===movedSmokeGroup),'moving a group to an existing container succeeds');
 const originalSpace=state.activeSpaceId;
 state=await command({type:'moveGroupToSpace',groupId:movedSmokeGroup,spaceId:'default'});
 check(state.activeGroupId===movedSmokeGroup&&state.groups.every(item=>item.spaceId!==originalSpace),'moving the last container group leaves its source space empty');
 state=await command({type:'activateSpace',spaceId:'default'});
 check(state.groups.some(item=>item.id===movedSmokeGroup),'moving a group back to default succeeds');

 const smokeTab=await browser.tabs.getCurrent();await browser.tabs.show([smokeTab.id]);await browser.tabs.update(smokeTab.id,{active:true});
 const backgroundTab=await browser.tabs.create({windowId,active:true,url:'about:blank'});
 for(let attempt=0;attempt<100&&!document.hidden;attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 let resumedHiddenStress=false;
 const stressResult=new Promise(resolve=>{const listener=event=>{if(event.data?.channel==='tavvy-stress-waiting'){resumedHiddenStress=document.hidden;browser.tabs.update(smokeTab.id,{active:true}).catch(error=>resolve({ok:false,error:error.message}));}if(event.data?.channel==='tavvy-stress'){window.removeEventListener('message',listener);resolve(event.data);}};window.addEventListener('message',listener);});
 const stressFrame=document.createElement('iframe');stressFrame.src=browser.runtime.getURL('stress.html');document.documentElement.append(stressFrame);
 const stress=await stressResult;check(resumedHiddenStress,'hidden virtualized page resumes after returning');check(stress.ok,stress.error||'1000-tab renderer: bounded DOM, last row reachable, 100 open/close cycles, listener cleanup');await browser.tabs.remove(backgroundTab.id);results.push('stress metrics: '+JSON.stringify(stress));
 const restoreWindow=await browser.windows.create({url:'http://127.0.0.1:${port}/before-restore',focused:false});
 const oldRestoreTab=restoreWindow.tabs[0].id;
 const beforeDownloads=(await browser.downloads.search({})).length;
 const replaceBackup={version:'5.3.2',groups:[{id:65432,title:'Replace smoke',tabs:[{url:'http://127.0.0.1:${port}/after-restore',title:'Restored tab'}]}]};
 const replaceResult=await browser.runtime.sendMessage({channel:'tavvy-command',windowId:restoreWindow.id,command:{type:'importStg',backup:replaceBackup,closeExistingTabs:true}});
 check(replaceResult.ok,'restore with replace succeeds: '+replaceResult.error);
 check((await browser.downloads.search({})).length>beforeDownloads,'safety backup download created before restore');
 check(!(await browser.tabs.query({windowId:restoreWindow.id})).some(t=>t.id===oldRestoreTab),'restore closes old tab when enabled');
 check((await browser.tabs.query({windowId:restoreWindow.id})).some(t=>t.url?.includes('/after-restore')),'restore retains imported tab');
 await browser.windows.remove(restoreWindow.id);

 await fetch('http://127.0.0.1:${port}',{method:'POST',body:JSON.stringify({ok:true,results})});
 }catch(error){await fetch('http://127.0.0.1:${port}',{method:'POST',body:JSON.stringify({ok:false,error:error.message,stack:error.stack,results})});}
})();`,
    resolveDir: process.cwd(),
  },
  outfile: `${dir}/smoke.js`,
  bundle: true,
});
await writeFile(
  `${dir}/stress.html`,
  '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="popup.css"><body><script src="stress.js"></script>',
);
// Reuse the application shell so stress checks run the production renderer in Firefox.
const shell = (await readFile(`${dir}/popup.html`, "utf8")).replace(
  "popup.js",
  "stress.js",
);
await writeFile(`${dir}/stress.html`, shell);
await build({
  entryPoints: ["tests/browser/stress-page.js"],
  bundle: true,
  outfile: `${dir}/stress.js`,
  target: "firefox140",
});
const args = [
  "node_modules/web-ext/bin/web-ext.js",
  "run",
  "--source-dir",
  dir,
  "--arg=-headless",
  "--pref=privacy.userContext.enabled=true",
  "--no-input",
  "--no-reload",
  "--start-url",
  "about:blank",
];
if (process.env.FIREFOX_BINARY)
  args.push("--firefox", process.env.FIREFOX_BINARY);
const child = spawn(process.execPath, args, {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
const timeout = setTimeout(
  () => resolveReport({ ok: false, error: "Firefox smoke timed out" }),
  55000,
);
child.on("error", (error) =>
  resolveReport({ ok: false, error: error.message }),
);
const result = await report;
clearTimeout(timeout);
console.log(JSON.stringify(result, null, 2));
server.close();
// Terminate only this isolated runner and its temporary-profile Firefox children.
if (process.platform === "win32")
  spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
else child.kill("SIGINT");
process.exitCode = result.ok ? 0 : 1;
