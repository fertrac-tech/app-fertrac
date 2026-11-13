import '@fontsource-variable/inter';
import './ui/styles/tokens.css';
import './ui/styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { readConfig } from './app/config';
import { createContainer } from './app/container';
import { App } from './ui/App';
import { ContainerProvider } from './ui/context';

declare const __APP_VERSION__: string;

const root = createRoot(document.getElementById('root') as HTMLElement);

try {
  const container = createContainer(readConfig(import.meta.env, __APP_VERSION__));
  root.render(
    <StrictMode>
      <ContainerProvider container={container}>
        <App basename={import.meta.env.BASE_URL} />
      </ContainerProvider>
    </StrictMode>,
  );
} catch (error) {
  root.render(<pre style={{ padding: 24, whiteSpace: 'pre-wrap' }}>{error instanceof Error ? error.message : String(error)}</pre>);
}
