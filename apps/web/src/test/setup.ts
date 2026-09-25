/**
 * jsdom renders <dialog> but implements none of its modal methods, so any
 * component calling showModal() would throw in a test. Modelled here down to
 * what the components rely on: the open state and the close event.
 */
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(): void {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(returnValue?: string): void {
    this.open = false;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}

/**
 * jsdom has no layout, so it implements no scrolling either — scrollIntoView()
 * is simply absent. Components that bring a row or a field into view would
 * throw in a test; here it is a no-op, and what such a component *marks* is
 * asserted instead of where it scrolled.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}
