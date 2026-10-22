'use client';

const EVENT_NAME = 'lixblogs:notifications-updated';

export function dispatchNotificationsUpdate(seenIds = null) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, {
    detail: { seenIds },
  }));
}

export function onNotificationsUpdate(callback) {
  const handler = (event) => callback(event.detail?.seenIds || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
