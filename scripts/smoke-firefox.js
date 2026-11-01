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
 const {id:windowId}=await browser.windows.getCurrent();
 async function command(command){ const result=await browser.runtime.sendMessage({channel:'tavvy-command',windowId,command});if(!result?.ok)throw new Error(result?.error || 'No background response');return result.snapshot; }
 let state=await command({type:'snapshot'});check(state.groups.some(g=>g.id==='inbox'),'background snapshot');
 const sample=await browser.tabs.create({url:'http://127.0.0.1:${port}/sample',active:false});
 for(let attempt=0;attempt<100;attempt++){const current=await browser.tabs.get(sample.id);if(current.status==='complete'&&current.url.includes('/sample'))break;await new Promise(resolve=>setTimeout(resolve,50));}
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
 state=await command({type:'closeTab',tabId:sample.id});const entry=state.archive.find(e=>e.url?.includes('/sample'));check(Boolean(entry),'real tab closure archived');
 state=await command({type:'restoreTab',entryId:entry.id});check(!state.archive.some(e=>e.id===entry.id),'restore removes archive entry');for(let attempt=0;attempt<100&&!state.tabs.some(t=>t.url?.includes('/sample'));attempt++){await new Promise(resolve=>setTimeout(resolve,50));state=await command({type:'snapshot'});}
 check(state.tabs.some(t=>t.url?.includes('/sample')),'real tab recreated');
 await command({type:'saveSettings',settings:{theme:'Тёмная',animations:false}});state=await command({type:'snapshot'});check(state.settings.animations===false,'settings persisted in Firefox storage');
 state=await command({type:'deleteGroup',groupId});check(!state.groups.some(g=>g.id===groupId),'group deletion');check(state.tabs.some(t=>t.url?.includes('/sample')),'group deletion preserves real tabs');
 state=await command({type:'createGroup',title:'Visibility parent'});const visibilityParent=state.groups.find(g=>g.title==='Visibility parent').id;
 await command({type:'activateGroup',groupId:visibilityParent});state=await command({type:'snapshot'});const parentTab=state.tabs.find(t=>t.groupId===visibilityParent).id;
 state=await command({type:'createGroup',title:'Visibility child',parentId:visibilityParent});const visibilityChild=state.groups.find(g=>g.title==='Visibility child').id;
 await command({type:'activateGroup',groupId:visibilityChild});state=await command({type:'snapshot'});const childTab=state.tabs.find(t=>t.groupId===visibilityChild).id;
 check(!(await browser.tabs.get(parentTab)).hidden,'parent mode shows ancestor tabs');
 state=await command({type:'saveSettings',settings:{...state.settings,nestedTabsVisibility:'children'}});check((await browser.tabs.get(parentTab)).hidden,'child mode hides ancestor tabs');
 await command({type:'activateGroup',groupId:visibilityParent});check(!(await browser.tabs.get(childTab)).hidden,'child mode shows descendant tabs');
 state=await command({type:'snapshot'});state=await command({type:'saveSettings',settings:{...state.settings,nestedGroups:false}});check((await browser.tabs.get(childTab)).hidden,'disabled nesting isolates group tabs');check(state.groups.find(g=>g.id===visibilityChild).parentId===visibilityParent,'disabled nesting preserves hierarchy');
 state=await command({type:'saveSettings',settings:{...state.settings,nestedGroups:true,nestedTabsVisibility:'parents'}});await command({type:'deleteGroup',groupId:visibilityChild});await command({type:'deleteGroup',groupId:visibilityParent});

 const frame=document.createElement('iframe');frame.src=browser.runtime.getURL('popup.html');document.documentElement.append(frame);
 for(let attempt=0;attempt<100&&!frame.contentDocument?.querySelector('.group-header');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 const ui=frame.contentDocument;check(Boolean(ui.querySelector('.group-header')),'live popup renders');
 check(!ui.body.textContent.includes('Глубокое обучение'),'popup uses live data, not fixtures');
 const retainedGroup=ui.querySelector('.group'); const retainedMarker=retainedGroup.querySelector('.marker');
 const fixedHeight=ui.querySelector('.popup').getBoundingClientRect().height;ui.querySelector('.settings-button').click();ui.querySelector('.theme-open').click();check(Math.abs(ui.querySelector('.popup').getBoundingClientRect().height-fixedHeight)<1,'popup height stays fixed across settings screens');
 const light=ui.querySelector('input[value="Светлая"]');light.checked=true;light.dispatchEvent(new Event('change'));
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.settings.theme==='Светлая')break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.settings.theme==='Светлая','popup settings reach background');
 ui.querySelector('.settings-back').click();
 const accentTrigger=ui.querySelector('.accent-trigger');accentTrigger.click();check(!ui.querySelector('#accent-palette').hidden,'accent palette opens on click');
 const accent=ui.querySelector('input[name="accent-color"][value="#f15d63"]');accent.click();check(ui.querySelector('#accent-palette').hidden,'accent palette closes after selection');
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.settings.accentColor==='#f15d63')break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.settings.accentColor==='#f15d63','accent color persists to Firefox storage');
 check(ui.documentElement.style.getPropertyValue('--accent-color')==='#f15d63','accent color is applied in Firefox');
 ui.querySelector('.settings-back').click();
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


 const backup={version:'5.3.2',groups:[{id:1,title:'Imported empty',iconColor:'#ff7800',tabs:[]},{id:2,title:'Imported tabs',iconColor:'#398dff',tabs:[{url:'http://127.0.0.1:${port}/imported',title:'Imported page'},{url:'file:///D:/smoke.pdf',title:'Imported file'}]}],pinnedTabs:[{url:'http://127.0.0.1:${port}/pinned',title:'Imported pinned'}]};

 ui.querySelector('.settings-button').click();ui.querySelector('.backup-open').click();ui.querySelector('.backup-import').click();
 let importTab;
 for(let attempt=0;attempt<100;attempt++){importTab=(await browser.tabs.query({windowId})).find(tab=>tab.url?.includes('/import.html'));if(importTab)break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(Boolean(importTab),'import button opens a persistent import page');
 const importFrame=document.createElement('iframe');importFrame.src=importTab.url;document.documentElement.append(importFrame);
 for(let attempt=0;attempt<100&&!importFrame.contentDocument?.querySelector('input[type=file]');attempt++)await new Promise(resolve=>setTimeout(resolve,50));
 const backupFile=new importFrame.contentWindow.File([JSON.stringify(backup)],'stg.json',{type:'application/json'});
 const importer=importFrame.contentDocument.querySelector('input[type=file]');Object.defineProperty(importer,'files',{configurable:true,value:[backupFile]});importer.dispatchEvent(new Event('change'));
 for(let attempt=0;attempt<100;attempt++){state=await command({type:'snapshot'});if(state.importReport?.groups===2)break;await new Promise(resolve=>setTimeout(resolve,50));}
 check(state.importReport.groups===2 && state.importReport.tabs===2,'existing import button recognizes STG backups');
 check(state.tabs.some(t=>t.url.includes('local-file.html')),'local-file links preserved as explanatory tabs');
 const importedCount=(await browser.tabs.query({windowId})).length;state=await command({type:'importStg',backup});check((await browser.tabs.query({windowId})).length===importedCount,'reimport creates no duplicates');

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

 const stressResult=new Promise(resolve=>{const listener=event=>{if(event.data?.channel==='tavvy-stress'){window.removeEventListener('message',listener);resolve(event.data);}};window.addEventListener('message',listener);});
 const stressFrame=document.createElement('iframe');stressFrame.src=browser.runtime.getURL('stress.html');document.documentElement.append(stressFrame);
 const stress=await stressResult;check(stress.ok,stress.error||'1000-tab renderer: bounded DOM, last row reachable, 100 open/close cycles, listener cleanup');results.push('stress metrics: '+JSON.stringify(stress));
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
