import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../public/admin-notifications.js',import.meta.url),'utf8');
function ui({sendCode=200,sendError=null,devices=1,configured=true,diagnosticsReady=true,stage='OAUTH_OK'}={}){
 const elements=new Map();
 const el=id=>{
  if(!elements.has(id))elements.set(id,{
   id,hidden:false,disabled:false,textContent:'',value:'',
   replaceChildren(){},append(){},reset(){},reportValidity(){return true}
  });
  return elements.get(id);
 };
 let attempts=0;
 const fetch=async(url,opts)=>{
  const action=url.split('/').pop();
  let status=200,data;
  if(action==='admin')data={subscribers:0,history:[]};
  else if(action==='native-status')data={devices,sendingConfigured:configured,testingOnly:true};
  else if(action==='native-diagnostics')data={ready:diagnosticsReady,stage};
  else if(action==='native-test'){
   attempts++;
   status=sendError?502:200;
   data=sendError?{error:sendError}:{accepted:sendCode===200,code:sendCode};
  }
  else throw Error('Unexpected test request '+url);
  return {ok:status>=200&&status<300,status,async json(){return data}};
 };
 const document={
  getElementById:el,
  querySelectorAll(){return []},
  createElement(tag){return {tag,textContent:'',append(){}}}
 };
 const context={document,fetch,window:{ZikaPush:{},zikaMediaHTML(){return ''}},confirm(){return true},crypto:globalThis.crypto};
 return {elements:el,run:()=>vm.runInNewContext(script,context),get attempts(){return attempts}};
}
test('Native Android test button sends and keeps the success message visible',async()=>{
 const a=ui();
 await a.run();
 assert.equal(a.elements('nativeSubscribers').textContent,1);
 assert.equal(a.elements('nativeTest').disabled,false);
 assert.equal(typeof a.elements('nativeRefresh').onclick,'function');
 await a.elements('nativeTest').onclick();
 assert.equal(a.attempts,1);
 assert.match(a.elements('nativeStatus').textContent,/Notification acceptée par Firebase/);
 assert.doesNotMatch(a.elements('nativeStatus').textContent,/Un appareil Android inscrit/);
 await a.elements('nativeRefresh').onclick();
 assert.match(a.elements('nativeStatus').textContent,/test Android disponible/);
 assert.equal(a.elements('nativeTest').disabled,false);
});
test('Native Android test error appears beside its button and is not silently erased',async()=>{
 const a=ui({sendError:'Attendez une minute entre deux tests.'});
 await a.run();
 await a.elements('nativeTest').onclick();
 assert.equal(a.attempts,1);
 assert.match(a.elements('nativeStatus').textContent,/Échec du test Android.*Attendez une minute/);
});
test('Native Android button stays disabled when no device or no server credentials are present',async()=>{
 for(const args of [{devices:0},{devices:2},{configured:false}]){
  const a=ui(args);await a.run();assert.equal(a.elements('nativeTest').disabled,true);
  assert.notEqual(a.elements('nativeStatus').textContent,'');
 }
});

test('Native diagnostic reports OAuth/configuration failure without sending a push',async()=>{
 const a=ui({diagnosticsReady:false,stage:'OAUTH_403'});
 await a.run();
 assert.equal(a.attempts,0);
 assert.equal(a.elements('nativeTest').disabled,true);
 assert.match(a.elements('nativeStatus').textContent,/OAUTH_403/);
});
test('Native test surfaces safe diagnostic stage on an HTTP failure',async()=>{
 const a=ui({sendError:'Le serveur Firebase a refusé le test.'});
 await a.run();
 await a.elements('nativeTest').onclick();
 assert.match(a.elements('nativeStatus').textContent,/Le serveur Firebase a refusé le test/);
});
