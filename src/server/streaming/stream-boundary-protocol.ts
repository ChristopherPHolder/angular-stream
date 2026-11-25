import type { StreamBoundaryPayload } from '../../app/streaming/stream-boundary.directive';

/**
 * A boundary frame is a `<template>` carrying the markup, followed by a commit
 * comment.
 *
 * The comment is the signal, not the template. A `MutationObserver` on
 * `document.body` fires as soon as the parser *opens* an element, so reacting
 * to the template would mean reading it while its content is still arriving.
 * The trailing comment can only be appended once the template has been closed,
 * so by the time it is observed the payload is complete. That ordering is the
 * whole reason the protocol has a separate marker.
 */
export function frameStreamBoundary({ id, html }: StreamBoundaryPayload): string {
  return `<template data-stream-boundary-payload="${id}">${html}</template><!--stream-boundary-commit:${id}-->`;
}

/**
 * The authoritative document is base64'd rather than inlined.
 *
 * It contains `<script>` tags and arbitrary markup; dropped into a `<template>`
 * verbatim, the first `</template>` or `</script>` sequence inside it would
 * close the wrapper early and corrupt the rest of the stream. Base64 has no
 * byte that the HTML tokenizer treats as special.
 */
export function frameFinalDocument(document: string): string {
  return `<template data-stream-final-document="base64">${toBase64(document)}</template><!--stream-final-document-commit-->`;
}

/**
 * `btoa` over UTF-8 bytes, chunked.
 *
 * `btoa` only accepts code points below 256, so the text is encoded to bytes
 * first. `String.fromCharCode(...bytes)` would spread an 80 KB document across
 * the argument list and overflow the stack, hence the fixed-size chunks.
 */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const CHUNK = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return btoa(binary);
}

/**
 * The client half of the protocol, inlined into the shell.
 *
 * This is a *classic* script on purpose. Classic inline scripts run
 * synchronously during parsing, while the application's module scripts are
 * deferred by definition and cannot run until parsing finishes. That ordering
 * guarantees the authoritative DOM is installed before Angular bootstraps, so
 * hydration never sees the preview.
 */
export const STREAM_BOUNDARY_PREVIEW_RUNTIME = `<script>(()=>{
  const markerPrefix='stream-boundary-commit:';
  const finalMarker='stream-final-document-commit';
  const eventContractScriptId='ng-event-dispatch-contract';
  const idPattern=/^[A-Za-z][A-Za-z0-9_-]*$/;
  const executableScriptTypes=new Set(['','module','text/javascript','application/javascript','text/ecmascript','application/ecmascript']);
  const preservedEventApps=new Set();
  let finalDocumentInstalled=false;
  const reportInvalid=(comment,template,id)=>{
    if(template)template.remove();
    comment.remove();
    console.error('[stream-boundary] Invalid payload for "'+id+'"');
  };
  const adjacentTemplate=(comment)=>{
    const previous=comment.previousSibling;
    return previous instanceof HTMLTemplateElement?previous:null;
  };
  const removeProtocolArtifacts=(parsedDocument)=>{
    for(const template of parsedDocument.querySelectorAll('template[data-stream-boundary-payload],template[data-stream-final-document]'))template.remove();
    for(const element of parsedDocument.querySelectorAll('[data-stream-boundary]'))element.removeAttribute('data-stream-boundary');
    const comments=parsedDocument.createTreeWalker(parsedDocument,NodeFilter.SHOW_COMMENT);
    const protocolComments=[];
    while(comments.nextNode()){
      const data=comments.currentNode.data;
      if(data===finalMarker||data.startsWith(markerPrefix))protocolComments.push(comments.currentNode);
    }
    for(const comment of protocolComments)comment.remove();
  };
  const rebindEarlyEventContracts=(body)=>{
    const apps=window._ejsas;
    const bootstrap=window.__jsaction_bootstrap;
    if(!apps||typeof bootstrap!=='function')return;
    for(const [appId,state] of Object.entries(apps)){
      if(!state||!Array.isArray(state.q)||!Array.isArray(state.et)||!Array.isArray(state.etc))continue;
      const queuedEvents=state.q.slice();
      if(state.c&&state.h){
        for(const eventType of state.et)state.c.removeEventListener(eventType,state.h);
        for(const eventType of state.etc)state.c.removeEventListener(eventType,state.h,true);
      }
      bootstrap(body,appId,state.et,state.etc);
      const reboundState=apps[appId];
      if(!reboundState)continue;
      reboundState.q.unshift(...queuedEvents);
      Object.assign(state,reboundState);
      apps[appId]=state;
      preservedEventApps.add(appId);
    }
  };
  const eventBootstrapAppId=(script)=>{
    const match=script.textContent.trim().match(/^window\\.__jsaction_bootstrap\\(document\\.body,\\s*"([^"]+)"/);
    return match?match[1]:null;
  };
  const activateScript=(script)=>{
    if(script.id===eventContractScriptId)return Promise.resolve();
    const appId=eventBootstrapAppId(script);
    if(appId!==null&&preservedEventApps.has(appId))return Promise.resolve();
    const type=(script.getAttribute('type')??'').trim().toLowerCase();
    if(!executableScriptTypes.has(type))return Promise.resolve();
    const activeScript=document.createElement('script');
    for(const attribute of script.attributes)activeScript.setAttribute(attribute.name,attribute.value);
    activeScript.async=false;
    activeScript.textContent=script.textContent;
    if(activeScript.hasAttribute('src')||type==='module'){
      return new Promise((resolve,reject)=>{
        activeScript.addEventListener('load',resolve,{once:true});
        activeScript.addEventListener('error',()=>reject(new Error('[stream-boundary] Failed to activate script')),{once:true});
        script.replaceWith(activeScript);
      });
    }
    script.replaceWith(activeScript);
    return Promise.resolve();
  };
  const activateScripts=async(scripts)=>{
    for(const script of scripts)await activateScript(script);
  };
  const processFinalCommit=(comment)=>{
    const template=adjacentTemplate(comment);
    if(finalDocumentInstalled){
      if(template)template.remove();
      comment.remove();
      return;
    }
    finalDocumentInstalled=true;
    try{
      if(template===null||template.getAttribute('data-stream-final-document')!=='base64')throw new Error('invalid frame');
      const encoded=template.content.textContent??'';
      if(encoded.length===0||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('invalid base64');
      const binary=atob(encoded);
      const bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
      const html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const authoritativeDocument=new DOMParser().parseFromString(html,'text/html');
      if(!/^\\s*<!doctype\\s+html[\\s>]/i.test(html)||authoritativeDocument.head===null||authoritativeDocument.body===null)throw new Error('invalid document');
      removeProtocolArtifacts(authoritativeDocument);
      observer.disconnect();
      document.head.replaceWith(authoritativeDocument.head);
      document.body.replaceWith(authoritativeDocument.body);
      rebindEarlyEventContracts(document.body);
      const scripts=Array.from(document.scripts);
      void activateScripts(scripts).catch(error=>console.error(error));
    }catch{
      if(template)template.remove();
      comment.remove();
      console.error('[stream-boundary] Invalid final document payload');
    }
  };
  const processBoundaryCommit=(comment)=>{
    const id=comment.data.slice(markerPrefix.length);
    const template=adjacentTemplate(comment);
    const cleanupTemplate=template??(comment.previousElementSibling instanceof HTMLTemplateElement?comment.previousElementSibling:null);
    const roots=template?template.content.childNodes:null;
    const root=roots&&roots.length===1&&roots[0].nodeType===Node.ELEMENT_NODE?roots[0]:null;
    const liveHosts=Array.from(document.querySelectorAll('[data-stream-boundary]')).filter(
      candidate=>candidate.getAttribute('data-stream-boundary')===id
    );
    if(!idPattern.test(id)||template===null||template.getAttribute('data-stream-boundary-payload')!==id||root===null||root.getAttribute('data-stream-boundary')!==id||liveHosts.length!==1){
      reportInvalid(comment,cleanupTemplate,id);
      return;
    }
    liveHosts[0].replaceWith(root);
    template.remove();
    comment.remove();
  };
  const processCommit=(node)=>{
    if(node.nodeType!==Node.COMMENT_NODE)return;
    if(node.data===finalMarker){
      processFinalCommit(node);
    }else if(node.data.startsWith(markerPrefix)){
      processBoundaryCommit(node);
    }
  };
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes)processCommit(node);
    }
  });
  observer.observe(document.body,{childList:true});
})();</script>`;
