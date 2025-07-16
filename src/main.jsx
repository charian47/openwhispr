import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ControlPanel from './components/ControlPanel.tsx'
import OnboardingFlow from './components/OnboardingFlow.tsx'
import './index.css'

function AppRouter() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Check if this is the control panel window
  const isControlPanel = window.location.pathname.includes('control') || 
                        window.location.search.includes('panel=true');
  
  // Check if this is the dictation panel (main app)
  const isDictationPanel = !isControlPanel;
  
  useEffect(() => {
    // Check if onboarding has been completed
    const onboardingCompleted = localStorage.getItem('onboardingCompleted');
    
    if (isControlPanel && !onboardingCompleted) {
      // Show onboarding for control panel if not completed
      setShowOnboarding(true);
    }
    
    setIsLoading(false);
  }, [isControlPanel]);
  
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem('onboardingCompleted', 'true');
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading OpenWispr...</p>
        </div>
      </div>
    );
  }
  
  // Hide dictation panel during onboarding
  if (isDictationPanel && localStorage.getItem('onboardingCompleted') !== 'true') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto bg-indigo-600 rounded-full flex items-center justify-center mb-4">
            <span className="text-white font-bold text-lg">OW</span>
          </div>
          <h2 className="text-xl font-semibold mb-2">Setup in Progress</h2>
          <p className="text-gray-300 mb-4">Please complete setup in the Control Panel first.</p>
          <button 
            onClick={() => window.electronAPI?.hideWindow?.()}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            Hide Window
          </button>
        </div>
      </div>
    );
  }
  
  if (isControlPanel && showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }
  
  return isControlPanel ? <ControlPanel /> : <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
)
