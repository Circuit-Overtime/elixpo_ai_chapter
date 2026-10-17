// Inert replacements for the standalone product's auth / cloud / collab
// state. These let us copy components that reference cloud-coupled hooks
// without hauling the whole product backend along. Each export mirrors
// the shape the consumer expects but with no-op implementations.

const noop = () => {};

const inertAuth = {
  isAuthenticated: false,
  user: null,
  setUser: noop,
  setAuthenticated: noop,
  logout: noop,
};

const inertCollab = {
  roomId: null,
  connected: false,
  setRoom: noop,
  setConnected: noop,
};

const inertProfile = {
  profile: null,
  setProfile: noop,
};

function makeStore(state) {
  // Match the zustand call signature used in selectors:
  //   const x = useStore((s) => s.foo)
  //   const x = useStore.getState().foo
  function useStore(selector) {
    return typeof selector === 'function' ? selector(state) : state;
  }
  useStore.getState = () => state;
  useStore.setState = noop;
  useStore.subscribe = () => () => {};
  return useStore;
}

export const useAuthStore = makeStore(inertAuth);
export const useCollabStore = makeStore(inertCollab);
export const useProfileStore = makeStore(inertProfile);

export const WORKER_URL = '';
export function getSessionID() {
  if (typeof window !== 'undefined' && window.__sessionID) return window.__sessionID;
  return null;
}

export async function triggerDocCloudSync() { /* offline mode: no-op */ }
export function persistLayoutMode() { /* offline mode: no-op */ }

// Cloud-sync trigger used by the standalone product's AppMenu / keyboard
// shortcuts. The package's offline build should never hit a server, so we
// resolve immediately. The host's onSceneChange callback (passed to
// LixSketchCanvas) handles real persistence.
export async function triggerCloudSync() { return false; }
