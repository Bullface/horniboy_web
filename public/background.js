import {openController,launch,getStatus,command} from './native.js';
let queue=Promise.resolve();
function serialize(fn){const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;}
chrome.action.onClicked.addListener(()=>{void serialize(()=>openController(chrome)).catch(console.error);});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('index.html')))return false;
  const run=async()=>{
    switch(message?.type){
      case 'launch':return launch(chrome,{...message,controllerId:sender.tab?.windowId});
      case 'status':return getStatus(chrome);
      case 'command':return command(chrome,message);
      default:throw new Error('INVALID_MESSAGE');
    }
  };
  serialize(run).then(data=>respond({ok:true,data}),()=>respond({ok:false,code:'EXTENSION_OPERATION_FAILED'}));
  return true;
});
