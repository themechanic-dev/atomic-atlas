// Entry point of the web UI. The same bundle runs in Electron, in Capacitor and in a browser.

import { render } from 'preact';
import { initSettings } from './state/settings';
import './styles/app.css';
import { App } from './ui/App';

initSettings();

const root = document.getElementById('app');
if (root) render(<App />, root);
