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
  const idPattern=/^[A-Za-z][A-Za-z0-9_-]*$/;
  const reportInvalid=(comment,template,id)=>{
    if(template)template.remove();
    comment.remove();
    console.error('[stream-boundary] Invalid payload for "'+id+'"');
  };
  const processCommit=(comment)=>{
    if(comment.nodeType!==Node.COMMENT_NODE||!comment.data.startsWith(markerPrefix))return;
    const id=comment.data.slice(markerPrefix.length);
    const previous=comment.previousSibling;
    const template=previous instanceof HTMLTemplateElement?previous:null;
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
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes)processCommit(node);
    }
  });
  observer.observe(document.body,{childList:true});
})();</script>`;
