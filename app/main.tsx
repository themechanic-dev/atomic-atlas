// Entry point of the web UI. The same bundle runs in Electron, in Capacitor and in a browser.

import { render } from 'preact';
import { initSettings } from './state/settings';
import { assistantSupported, refreshAssistant } from './state/assistant';
import { initVoice } from './state/voice';
import './styles/app.css';
import { App } from './ui/App';

initSettings();
initVoice();
// Whether the assistant is installed decides if “Ask the assistant” is offered next to results.
if (assistantSupported()) void refreshAssistant();

const root = document.getElementById('app');
if (root) render(<App />, root);
