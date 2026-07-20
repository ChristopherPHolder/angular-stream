import { Buffer } from 'node:buffer';
import type { StreamBoundaryPayload } from '../../app/streaming/stream-boundary.directive';

export function frameStreamBoundary({
  id,
  html,
}: StreamBoundaryPayload): string {
  return `<template data-stream-boundary-payload="${id}">${html}</template><!--stream-boundary-commit:${id}-->`;
}

export function frameFinalDocument(document: string): string {
  const encodedDocument = Buffer.from(document, 'utf8').toString('base64');

  return `<template data-stream-final-document="base64">${encodedDocument}</template><!--stream-final-document-commit-->`;
}

export const STREAM_BOUNDARY_PREVIEW_RUNTIME = `<script>(()=>{
  const markerPrefix='stream-boundary-commit:';
  const finalMarker='stream-final-document-commit';
  const idPattern=/^[A-Za-z][A-Za-z0-9_-]*$/;
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
      document.head.replaceWith(authoritativeDocument.head);
      document.body.replaceWith(authoritativeDocument.body);
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
