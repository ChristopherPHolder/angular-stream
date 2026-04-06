import {
  Injectable,
  Renderer2,
  RendererType2,
  ViewEncapsulation,
} from '@angular/core';
import { ɵDomRendererFactory2 } from '@angular/platform-browser';

declare const ngServerMode: boolean | undefined;

const rendererDebugState = {
  patchedRenderers: new WeakSet<Renderer2>(),
  seenRenderers: new WeakSet<Renderer2>(),
};

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

function describeEncapsulation(
  encapsulation: RendererType2['encapsulation'] | null | undefined
) {
  switch (encapsulation) {
    case ViewEncapsulation.Emulated:
      return 'Emulated';
    case ViewEncapsulation.None:
      return 'None';
    case ViewEncapsulation.ShadowDom:
      return 'ShadowDom';
    default:
      return encapsulation ?? null;
  }
}

function truncate(value: unknown, maxLength = 120) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function getRendererReason(
  hostElement: any,
  type: RendererType2 | null,
  isNewRendererInstance: boolean
) {
  if (!type) {
    return 'default-renderer-request';
  }

  if (!hostElement) {
    return 'root-host-bootstrap';
  }

  return isNewRendererInstance
    ? 'first-renderer-for-component-type'
    : 'reused-renderer-for-component-instance';
}

function logRendererOperation(
  operation: string,
  details: Record<string, unknown>
) {
  console.log(`[renderer:${currentRuntime()}] ${operation}`, details);
}

function patchRenderer(renderer: Renderer2): void {
  if (rendererDebugState.patchedRenderers.has(renderer)) {
    return;
  }

  rendererDebugState.patchedRenderers.add(renderer);

  const originalSelectRootElement = renderer.selectRootElement.bind(renderer);
  renderer.selectRootElement = (
    selectorOrNode: string | any,
    preserveContent?: boolean
  ) => {
    logRendererOperation('selectRootElement', {
      preserveContent: preserveContent ?? false,
      selectorOrNode:
        typeof selectorOrNode === 'string'
          ? selectorOrNode
          : describeNode(selectorOrNode),
    });

    return originalSelectRootElement(selectorOrNode, preserveContent);
  };

  const originalCreateElement = renderer.createElement.bind(renderer);
  renderer.createElement = (name: string, namespace?: string | null) => {
    const element = originalCreateElement(name, namespace);
    logRendererOperation('createElement', {
      element: describeNode(element),
      name,
      namespace: namespace ?? null,
    });

    return element;
  };

  const originalAppendChild = renderer.appendChild.bind(renderer);
  renderer.appendChild = (parent: any, newChild: any) => {
    logRendererOperation('appendChild', {
      child: describeNode(newChild),
      parent: describeNode(parent),
    });

    originalAppendChild(parent, newChild);
  };

  const originalInsertBefore = renderer.insertBefore.bind(renderer);
  renderer.insertBefore = (
    parent: any,
    newChild: any,
    refChild: any,
    isMove?: boolean
  ) => {
    logRendererOperation('insertBefore', {
      child: describeNode(newChild),
      isMove: isMove ?? false,
      parent: describeNode(parent),
      refChild: describeNode(refChild),
    });

    originalInsertBefore(parent, newChild, refChild, isMove);
  };

  const originalRemoveChild = renderer.removeChild.bind(renderer);
  renderer.removeChild = (
    parent: any,
    oldChild: any,
    isHostElement?: boolean
  ) => {
    logRendererOperation('removeChild', {
      child: describeNode(oldChild),
      isHostElement: isHostElement ?? false,
      parent: describeNode(parent),
    });

    originalRemoveChild(parent, oldChild, isHostElement);
  };

  const originalSetAttribute = renderer.setAttribute.bind(renderer);
  renderer.setAttribute = (
    el: any,
    name: string,
    value: string,
    namespace?: string | null
  ) => {
    logRendererOperation('setAttribute', {
      element: describeNode(el),
      name,
      namespace: namespace ?? null,
      value: truncate(value),
    });

    originalSetAttribute(el, name, value, namespace);
  };
}

@Injectable()
class PatchedDomRendererFactory extends ɵDomRendererFactory2 {
  override createRenderer(element: any, type: RendererType2 | null): Renderer2 {
    const renderer = super.createRenderer(element, type);
    const isNewRendererInstance =
      !rendererDebugState.seenRenderers.has(renderer);

    rendererDebugState.seenRenderers.add(renderer);
    patchRenderer(renderer);

    const runtime = currentRuntime();
    const logPayload = {
      componentId: type?.id ?? null,
      encapsulation: describeEncapsulation(type?.encapsulation),
      externalStyleCount: type?.getExternalStyles?.()?.length ?? 0,
      host: describeNode(element),
      hostParent: describeNode(element?.parentNode),
      inlineStyleCount: type?.styles?.length ?? 0,
      isNewRendererInstance,
      reason: getRendererReason(element, type, isNewRendererInstance),
      runtime,
    };

    console.log(
      `[renderer:${runtime}] createRenderer ${logPayload.reason}`,
      logPayload
    );

    if (!element || !type || isNewRendererInstance) {
      console.trace('[renderer trace]');
    }

    return renderer;
  }
}

export function patchedDomRendererFactory() {
  return { provide: ɵDomRendererFactory2, useClass: PatchedDomRendererFactory }
}
