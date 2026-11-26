import type { StreamChunk, StreamInit } from '../../app/streaming/stream-protocol';

/**
 * JSON that is safe inside an inline `<script>`: no `<` to end the element
 * early, no line separators to end a string literal early.
 */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * The client half of the protocol, inlined into the shell.
 *
 * It is a classic script so that it exists before the application's module
 * scripts run, and so that each chunk's own inline script can call into it
 * synchronously while the parser is still receiving the response. That is what
 * lets content paint before Angular has loaded, and keeps a swap atomic once
 * it has: no task can run between a block's markup changing and its data
 * changing.
 *
 * A chunk replaces a `@defer` block's root nodes. They are the siblings in
 * front of the block's anchor comment, `<!--ngh=<id>-->`. How many there are
 * comes from the chunk until the application is running, and from the
 * application after that. Angular's two text markers need care on both sides
 * of the swap:
 *
 *  - `ngtns` separates two adjacent text nodes and is not a node of its own,
 *    so it is not counted when walking back from the anchor;
 *  - Angular resolves the markers once, for the whole application, when it
 *    bootstraps. Markup inserted afterwards has to arrive already resolved.
 */
function runtimeSource(init: StreamInit): string {
  return `(()=>{
var S=window.__ngs=Object.assign({done:false,log:[],sink:null},${scriptJson(init)});
function take(id){
  var t=document.querySelector('template[data-ngs="'+id+'"]');
  if(t)t.remove();
  return t;
}
function anchorOf(id){
  var w=document.createTreeWalker(document.body,128),c,text='ngh='+id;
  while(c=w.nextNode())if(c.data.trim()===text)return c;
  return null;
}
function swap(block,base,count){
  var t=take(block.id),anchor=t&&anchorOf(block.id);
  if(!anchor)return null;
  var content=t.content,hosts=content.querySelectorAll('[ngh]'),i,c,markers=[];
  for(i=0;i<hosts.length;i++){
    hosts[i].setAttribute('ngh',hosts[i].getAttribute('ngh').split('|').map(function(part){
      return part===''?part:String(+part+base);
    }).join('|'));
  }
  var w=document.createTreeWalker(content,128);
  while(c=w.nextNode())if(c.data==='ngetn'||c.data==='ngtns')markers.push(c);
  for(i=0;i<markers.length;i++){
    if(markers[i].data==='ngetn')markers[i].replaceWith(document.createTextNode(''));
    else markers[i].remove();
  }
  var first=content.firstChild,left=count,node=anchor.previousSibling,previous;
  while(left>0&&node){
    previous=node.previousSibling;
    if(!(node.nodeType===8&&node.data==='ngtns'))left--;
    node.remove();
    node=previous;
  }
  anchor.before(content);
  return {first:first};
}
S.push=function(chunk){
  var swapped={},i,block,base,count,result;
  for(i=0;i<chunk.b.length;i++){
    block=chunk.b[i];
    base=S.n;
    S.n+=block.n.length;
    count=S.sink?S.sink.rootNodes(block):block.o;
    if(count===null){take(block.id);continue;}
    result=swap(block,base,count);
    if(result)swapped[block.id]=result;
  }
  S.p=chunk.p;
  if(chunk.done)S.done=true;
  var entry={chunk:chunk,swapped:swapped};
  if(S.sink)S.sink.apply(entry);else S.log.push(entry);
  var script=document.currentScript;
  if(script)script.remove();
};
document.addEventListener('DOMContentLoaded',function(){
  if(!S.done)S.push({b:[],s:{},p:[],done:true,aborted:true});
});
})();`;
}

/** The script that installs `window.__ngs`, for the end of the shell. */
export function frameRuntime(init: StreamInit): string {
  return `<script>${runtimeSource(init)}</script>`;
}

/**
 * One flush: a `<template>` per replaced block, then the script that applies
 * them. The script comes last because it runs the moment the parser reaches
 * it, and by then every template ahead of it is complete.
 */
export function frameChunk(chunk: StreamChunk, markup: ReadonlyMap<string, string>): string {
  let frame = '';
  for (const block of chunk.b) {
    frame += `<template data-ngs="${block.id}">${markup.get(block.id) ?? ''}</template>`;
  }

  return `${frame}<script>__ngs.push(${scriptJson(chunk)})</script>`;
}
