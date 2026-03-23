import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.jsx'
import { initProfiler } from './lib/perfProfiler'
import { loadCalibration } from './lib/calibration'

// Load live calibration coefficients from Firestore on startup (fire-and-forget)
loadCalibration();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Start site-wide profiler after initial render
initProfiler()
