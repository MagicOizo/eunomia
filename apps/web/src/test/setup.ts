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
