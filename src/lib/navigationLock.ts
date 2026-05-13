const NAVIGATION_LOCK_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[data-navigation-lock="true"]',
].join(',');

const getElementFromTarget = (target: EventTarget | null): Element | null => {
  if (typeof Element !== 'undefined' && target instanceof Element) return target;
  if (typeof Node !== 'undefined' && target instanceof Node) return target.parentElement;
  return null;
};

export const isNavigationLockedTarget = (target: EventTarget | null): boolean => {
  const element = getElementFromTarget(target);
  return Boolean(element?.closest(NAVIGATION_LOCK_SELECTOR));
};

export const isKeyboardNavigationBlocked = (event: KeyboardEvent): boolean => {
  if (isNavigationLockedTarget(event.target)) return true;
  if (typeof document === 'undefined') return false;
  return isNavigationLockedTarget(document.activeElement);
};

export const isKeyboardNavigationLocked = (): boolean => {
  if (typeof document === 'undefined') return false;
  return isNavigationLockedTarget(document.activeElement);
};
