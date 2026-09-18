import type { MarketSymbol, PopupBridge, Quote, Request, Response, Settings, Snapshot } from '../shared/types';

function send<T>(request: Request): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!globalThis.chrome?.runtime?.id) { reject(new Error('扩展后台不可用')); return; }
    try {
      chrome.runtime.sendMessage(request, (reply: Response<T> | undefined) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) { reject(new Error(runtimeError.message ?? '后台通信失败')); return; }
        if (!reply || typeof reply !== 'object' || typeof reply.ok !== 'boolean') { reject(new Error('后台响应无效')); return; }
        if (!reply.ok) { reject(new Error(reply.error)); return; }
        resolve(reply.data);
      });
    } catch (error) { reject(error); }
  });
}

export const chromeBridge: PopupBridge = {
  isPreview: false,
  getState: () => send<Snapshot>({ type: 'GET_STATE' }),
  getSymbols: (market = 'spot') => send<MarketSymbol[]>({ type: 'GET_SYMBOLS', market }),
  getQuote: (symbol: MarketSymbol) => send<Quote>({ type: 'GET_QUOTE', symbol }),
  updateSettings: (patch: Partial<Omit<Settings, 'version'>>) => send<Snapshot>({ type: 'UPDATE_SETTINGS', patch }),
  refresh: () => send<Snapshot>({ type: 'REFRESH' }),
  subscribe(listener) {
    let disposed = false;
    let port: chrome.runtime.Port | undefined;
    let retryTimer: number | undefined;
    let attempts = 0;
    let lastState: Snapshot | undefined;

    function connect() {
      if (disposed || !globalThis.chrome?.runtime?.id) return;
      try {
        const current = chrome.runtime.connect({ name: 'popup' });
        port = current;
        current.onMessage.addListener((message: unknown) => {
          if (disposed || !message || typeof message !== 'object') return;
          const packet = message as { type?: string; state?: Snapshot };
          if (packet.type === 'STATE' && packet.state) {
            lastState = packet.state;
            listener(packet.state);
          }
        });
        current.onDisconnect.addListener(() => {
          if (disposed || port !== current) return;
          port = undefined;
          if (lastState) {
            const message = chrome.runtime.lastError?.message ?? '后台连接中断';
            lastState = {
              ...lastState,
              connection: { ...lastState.connection, status: 'offline', message },
              connections: lastState.connections && Object.fromEntries(
                Object.entries(lastState.connections).map(([market, connection]) => [market, { ...connection, status: 'offline', message }]),
              ),
            };
            listener(lastState);
          }
          retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10_000));
        });
        attempts = 0;
      } catch {
        retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10_000));
      }
    }
    connect();
    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      port?.disconnect();
      port = undefined;
    };
  },
};
