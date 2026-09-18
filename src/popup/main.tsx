import { createRoot } from 'react-dom/client';
import App from './App';
import { chromeBridge } from './bridge';

const bridge = import.meta.env.DEV && !globalThis.chrome?.runtime?.id
  ? (await import('./preview')).previewBridge
  : chromeBridge;

createRoot(document.getElementById('root')!).render(<App bridge={bridge} />);
