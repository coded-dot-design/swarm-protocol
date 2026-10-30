/** Empty owned children follow layout, transforms and nested scrolling natively. */
export class ElementAttachments {
  private readonly hosts = new Map<Element, HTMLElement>();
  private readonly doc: Document;
  private readonly writeStyle: (
    element: HTMLElement,
    property: string,
    value: string,
    priority?: string,
  ) => void;
  constructor(
    doc: Document,
    writeStyle: (
      element: HTMLElement,
      property: string,
      value: string,
      priority?: string,
    ) => void,
  ) {
    this.doc = doc;
    this.writeStyle = writeStyle;
  }
  attach(element: Element): ShadowRoot | null {
    const existing = this.hosts.get(element);
    if (existing) return existing.shadowRoot;
    const HTMLElement = this.doc.defaultView?.HTMLElement;
    if (
      !HTMLElement ||
      !(element instanceof HTMLElement) ||
      /^(IMG|INPUT|BR|HR|CANVAS|VIDEO|IFRAME|TEXTAREA|SELECT)$/.test(
        element.tagName,
      )
    )
      return null;
    if (this.doc.defaultView!.getComputedStyle(element).position === "static")
      this.writeStyle(element, "position", "relative", "important");
    const host = this.doc.createElement("dom-virus-attachment");
    host.setAttribute("data-dom-virus-effect", "");
    host.setAttribute("data-swarm-ignore", "");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "all:initial!important;position:absolute!important;inset:0!important;display:block!important;border-radius:inherit!important;pointer-events:none!important;user-select:none!important;";
    const root = host.attachShadow({ mode: "open" });
    element.append(host);
    this.hosts.set(element, host);
    return root;
  }
  remove(element: Element) {
    const host = this.hosts.get(element);
    for (const animation of host?.shadowRoot?.getAnimations?.() ?? [])
      animation.cancel();
    host?.remove();
    this.hosts.delete(element);
  }
  clear() {
    for (const element of this.hosts.keys()) this.remove(element);
  }
}
