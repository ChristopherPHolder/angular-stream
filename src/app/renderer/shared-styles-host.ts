import { Injectable } from '@angular/core';
import { ɵSharedStylesHost } from '@angular/platform-browser';

declare const ngServerMode: boolean | undefined;


function currentRuntime() {
  return typeof ngServerMode !== 'undefined' && ngServerMode
    ? 'server'
    : 'browser';
}

function describeNode(node: any): string {
  if (!node) {
    return 'null';
  }

  if (node.nodeType === 3) {
    return '#text';
  }

  if (node.nodeType === 8) {
    return '#comment';
  }

  if (node.nodeType === 9) {
    return '#document';
  }

  const tagName =
    node.tagName?.toLowerCase?.() ??
    node.nodeName?.toLowerCase?.() ??
    typeof node;
  const id = node.id ? `#${node.id}` : '';
  const className =
    typeof node.className === 'string' && node.className.trim().length > 0
      ? `.${node.className.trim().split(/\s+/).join('.')}`
      : '';

  return `${tagName}${id}${className}`;
}


function truncate(value: unknown, maxLength = 120) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}


@Injectable()
class LoggingSharedStylesHost extends ɵSharedStylesHost {
  override addStyles(styles: string[], urls?: string[]): void {
    console.log(`[styles:${currentRuntime()}] addStyles`, {
      externalStyleCount: urls?.length ?? 0,
      externalUrls: urls ?? [],
      inlineStyleCount: styles.length,
      inlineStylePreview: styles
        .slice(0, 2)
        .map((style) => truncate(style, 80)),
      target: 'document.head',
    });

    super.addStyles(styles, urls);
  }

  override removeStyles(styles: string[], urls?: string[]): void {
    console.log(`[styles:${currentRuntime()}] removeStyles`, {
      externalStyleCount: urls?.length ?? 0,
      inlineStyleCount: styles.length,
      target: 'document.head',
    });

    super.removeStyles(styles, urls);
  }

  override addHost(hostNode: Node): void {
    console.log(`[styles:${currentRuntime()}] addHost`, {
      host: describeNode(hostNode),
    });

    super.addHost(hostNode);
  }

  override removeHost(hostNode: Node): void {
    console.log(`[styles:${currentRuntime()}] removeHost`, {
      host: describeNode(hostNode),
    });

    super.removeHost(hostNode);
  }
}


export function providedPatchedSharedStylesHost() {
  return { provide: ɵSharedStylesHost, useClass: LoggingSharedStylesHost }
}
