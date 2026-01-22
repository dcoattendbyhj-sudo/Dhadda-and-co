
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { db } from './services/db';

const startApp = async () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error("Could not find root element");

  const root = ReactDOM.createRoot(rootElement);
  
  // Professional Boot Screen
  root.render(
    <div className="h-screen w-full flex items-center justify-center bg-[#f8fafc]">
      <div className="text-center space-y-6">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-black text-slate-900 tracking-tighter uppercase text-[10px]">Secure Link Established</p>
          <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest animate-pulse">Synchronizing Personnel Data...</p>
        </div>
      </div>
    </div>
  );

  try {
    // Attempt to synchronize with Supabase
    await db.initialize();
    
    // Mount the Enterprise Application
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error: any) {
    console.error("Critical System Failure:", error);
    
    // Production Error State
    root.render(
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[#f8fafc] text-center">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] p-12 shadow-2xl border border-rose-100">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <h1 className="text-slate-900 font-black text-2xl mb-2 tracking-tight">Cloud Link Severed</h1>
          <p className="text-slate-500 font-bold text-xs mb-8 leading-relaxed">
            The application could not establish a secure handshake with the database. Please verify your internet connection and database permissions.
          </p>
          
          <div className="bg-rose-50 p-4 rounded-xl mb-8">
            <p className="text-[10px] font-mono text-rose-600 break-all">{error.message}</p>
          </div>

          <button 
            onClick={() => window.location.reload()} 
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all"
          >
            Retry Connection
          </button>
        </div>
        <p className="mt-8 text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">AttendPro Resilience Layer v1.0</p>
      </div>
    );
  }
};

startApp();
