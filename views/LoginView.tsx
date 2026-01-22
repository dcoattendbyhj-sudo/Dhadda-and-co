
import React, { useState, useEffect } from 'react';
import { ShieldCheck, User as UserIcon, Lock, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { User } from '../types';
import { supabase } from '../services/db';
import { STORAGE_KEYS } from '../constants';

interface LoginViewProps {
  onLogin: (user: User) => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('system_config').select('id').limit(1);
        setIsConnected(!error);
      } catch {
        setIsConnected(false);
      }
    };
    checkConnection();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const normalizedId = id.trim();

    try {
      console.log(`Authenticating Identity: ${normalizedId}...`);
      
      // Look up user by ID (Case-Insensitive)
      const { data: user, error: dbError } = await supabase
        .from('users')
        .select('*')
        .ilike('id', normalizedId)
        .single();

      if (dbError) {
        if (dbError.code === 'PGRST116') {
          throw new Error(`The Staff ID "${normalizedId}" was not found in the personnel registry.`);
        } else {
          throw new Error(`Gateway Error: ${dbError.message}`);
        }
      }

      // Validate Password
      if (user.password !== password) {
        throw new Error('Access Denied: Invalid security token provided.');
      }

      console.log("Authorization success.");
      const { password: _, ...safeUser } = user;
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(safeUser));
      onLogin(safeUser as User);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] bg-[radial-gradient(circle_at_top_right,_#e0e7ff,_#f8fafc)] flex items-center justify-center p-4">
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-3xl shadow-2xl shadow-indigo-200 mb-6 transition-transform hover:scale-105 duration-500">
            <ShieldCheck size={40} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">AttendPro<span className="text-indigo-600">.</span></h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Professional Enterprise Suite</p>
        </div>

        <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200 border border-white">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Personnel Access</h2>
            <div className="flex items-center gap-2">
              {isConnected === null ? (
                <div className="w-2 h-2 bg-slate-200 rounded-full animate-pulse"></div>
              ) : isConnected ? (
                <Wifi size={14} className="text-emerald-500" />
              ) : (
                <WifiOff size={14} className="text-rose-500" />
              )}
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 p-5 rounded-2xl text-xs mb-8 flex gap-4 items-start animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-black uppercase tracking-wider">Authentication Fault</p>
                <p className="font-bold opacity-80">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Corporate Identity (ID)</label>
              <div className="relative group">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  type="text" 
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none"
                  placeholder="Staff ID"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Authorized Access Token</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading || isConnected === false}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3 mt-4"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>AUTHORIZE ACCESS</span>
                  <ShieldCheck size={18} />
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="mt-8 text-center text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
          End-to-End Cloud Verification Active
        </p>
      </div>
    </div>
  );
};

export default LoginView;
