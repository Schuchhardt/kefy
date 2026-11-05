import { createRoot } from 'react-dom/client';
import { KefyApp } from './App';
import './styles.css';

// Sin StrictMode: en desarrollo montaría dos veces y abriría dos conexiones con el host.
createRoot(document.getElementById('root')!).render(<KefyApp />);
