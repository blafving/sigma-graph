import { createRoot } from 'react-dom/client';
import './index.css';
import '@react-sigma/core/lib/style.css';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';

console.log('[MAIN] About to create root...');

try {
  const root = createRoot(document.getElementById('root')!);
  console.log('[MAIN] Root created, rendering...');
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
  console.log('[MAIN] Rendered successfully');
} catch (err) {
  console.error('[MAIN] Fatal error during render:', err);
  document.getElementById('root')!.innerHTML = '<pre style="color:red;font-family:monospace;">FATAL: ' + err + '</pre>';
}
