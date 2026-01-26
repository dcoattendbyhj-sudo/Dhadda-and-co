import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { User, UserRole, Notification, SystemConfig, AttendanceRecord } from './types';
import { STORAGE_KEYS } from './constants';
import { db, supabase } from './services/db';

// Icons
import { 
  LayoutDashboard, 
  Clock, 
  CalendarDays, 
  Users, 
  Settings, 
  LogOut, 
  ShieldCheck,
  BarChart3,
  Menu,
  X,
  RefreshCw
} from 'lucide-react';

// Views
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';
import AttendanceView from './views/AttendanceView';
import LeaveView from './views/LeaveView';
import ManagementView from './views/ManagementView';
import WorkInsightsView from './views/WorkInsightsView';
import NotificationCenter from './components/NotificationCenter';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (session) {
      setUser(JSON.parse(session));
    }
    setLoading(false);
  }, []);

  // Auto Clock-Out Scrub Logic
  useEffect(() => {
    const runAutoClockOutScrub = async () => {
      if (!user) return;
      setScrubbing(true);
      try {
        const { data: configRaw } = await supabase.from('system_config').select('config').eq('id', 'global').single();
        const config = (configRaw?.config as unknown as SystemConfig);
        if (!config) return;

        const officialOutTime = config.officialClockOutTime; // "HH:mm"
        const [outH, outM] = officialOutTime.split(':').map(Number);
        
        // Fetch all open sessions
        const { data: openSessions } = await supabase
          .from('attendance')
          .select('*')
          .is('clockOut', null);

        if (openSessions && openSessions.length > 0) {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          
          for (const session of openSessions) {
            const sessionDate = session.date;
            let shouldClose = false;
            let closeAt = "";

            if (sessionDate < todayStr) {
              // Stale from previous day
              shouldClose = true;
              const d = new Date(sessionDate);
              d.setHours(outH, outM, 0, 0);
              closeAt = d.toISOString();
            } else if (sessionDate === todayStr) {
              // Same day, check if past cutoff
              const cutoff = new Date();
              cutoff.setHours(outH, outM, 0, 0);
              if (now > cutoff) {
                shouldClose = true;
                closeAt = cutoff.toISOString();
              }
            }

            if (shouldClose) {
              await supabase.from('attendance').update({ 
                clockOut: closeAt,
                // Optional: mark as auto-closed
                selfieBase64: session.selfieBase64 + ' [AUTO_TERMINATED]'
              }).eq('id', session.id);
            }
          }
        }
      } catch (err) {
        console.error("Auto Clock-Out Protocol Failed:", err);
      } finally {
        setScrubbing(false);
      }
    };

    runAutoClockOutScrub();
  }, [user]);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (user) {
        try {
          const allNotifs = await db.getFiltered<Notification>('notifications', 'recipientId', user.id);
          setNotifications(allNotifs);
        } catch (err) {
          console.error("Failed to fetch notifications", err);
        }
      }
    };
    fetchNotifications();
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    setUser(null);
    setSidebarOpen(false);
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-black text-slate-900 tracking-tighter uppercase text-[10px]">Initializing System Security...</p>
      </div>
    </div>
  );

  if (!user) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginView onLogin={setUser} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
    );
  }

  const NavItem = ({ to, icon: Icon, label, roles }: { to: string, icon: any, label: string, roles: UserRole[] }) => {
    if (!roles.includes(user.role)) return null;
    return (
      <Link 
        to={to} 
        onClick={() => setSidebarOpen(false)}
        className="flex items-center gap-4 px-5 py-4 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all rounded-2xl mb-1 group"
      >
        <Icon size={20} className="group-hover:scale-110 transition-transform" />
        <span className="font-black text-[11px] tracking-widest uppercase">{label}</span>
      </Link>
    );
  };

  return (
    <HashRouter>
      <div className="min-h-screen bg-[#f1f5f9] text-slate-900 flex flex-col md:flex-row font-sans">
        {/* Mobile Header */}
        <header className="md:hidden bg-white text-slate-900 p-5 flex justify-between items-center sticky top-0 z-40 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-indigo-600" size={24} />
            <span className="font-black text-lg tracking-tighter">AttendPro<span className="text-indigo-600">.</span></span>
          </div>
          <div className="flex items-center gap-4">
            <NotificationCenter notifications={notifications} userId={user.id} onRefresh={async () => {
               try {
                 const allNotifs = await db.getFiltered<Notification>('notifications', 'recipientId', user.id);
                 setNotifications(allNotifs);
               } catch (err) {
                 console.error("Failed to refresh notifications", err);
               }
            }} />
            <button onClick={() => setSidebarOpen(true)} className="p-1">
              <Menu size={24} />
            </button>
          </div>
        </header>

        {/* Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-sm z-50 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar / Desktop Navigation */}
        <aside className={`fixed md:sticky top-0 left-0 z-50 h-screen w-80 bg-white border-r border-slate-200 p-8 flex flex-col transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="flex items-center gap-3 mb-12 px-2">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
              <ShieldCheck className="text-white" size={24} />
            </div>
            <span className="font-black text-2xl tracking-tighter text-slate-900">AttendPro<span className="text-indigo-600">.</span></span>
          </div>

          <nav className="flex-1 space-y-2">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-6 px-4">Organization</p>
            <NavItem to="/" icon={LayoutDashboard} label="DASHBOARD" roles={[UserRole.BOSS, UserRole.MANAGER, UserRole.EMPLOYEE]} />
            <NavItem to="/insights" icon={BarChart3} label="WORK STATUS" roles={[UserRole.MANAGER, UserRole.EMPLOYEE]} />
            <NavItem to="/attendance" icon={Clock} label="ATTENDANCE" roles={[UserRole.BOSS, UserRole.MANAGER, UserRole.EMPLOYEE]} />
            <NavItem to="/leave" icon={CalendarDays} label="LEAVE PORTAL" roles={[UserRole.BOSS, UserRole.MANAGER, UserRole.EMPLOYEE]} />
            
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mt-12 mb-6 px-4">Management</p>
            <NavItem to="/management" icon={Users} label="TEAM HUB" roles={[UserRole.BOSS, UserRole.MANAGER]} />
            <NavItem to="/settings" icon={Settings} label="SYSTEM CONFIG" roles={[UserRole.BOSS]} />
          </nav>

          <div className="mt-auto">
            {scrubbing && (
               <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-indigo-50 rounded-xl">
                 <RefreshCw size={12} className="text-indigo-600 animate-spin" />
                 <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Protocol Syncing</span>
               </div>
            )}
            <div className="bg-slate-50 rounded-3xl p-5 mb-8 border border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-lg text-indigo-600 shadow-sm overflow-hidden">
                  {user.profileSelfie ? <img src={user.profileSelfie} className="w-full h-full object-cover" /> : user.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <p className="font-black text-sm text-slate-900 truncate">{user.name}</p>
                  <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest">{user.role}</p>
                </div>
              </div>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-4 w-full px-6 py-4 text-red-500 hover:bg-red-50 transition-all rounded-2xl font-black text-xs uppercase tracking-widest">
              <LogOut size={18} />
              <span>TERMINATE SESSION</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 p-6 md:p-12 lg:p-16 overflow-y-auto relative z-10 bg-[#f8fafc]">
          <div className="min-h-full flex flex-col">
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<DashboardView user={user} />} />
                <Route path="/insights" element={<WorkInsightsView user={user} />} />
                <Route path="/attendance" element={<AttendanceView user={user} />} />
                <Route path="/leave" element={<LeaveView user={user} />} />
                <Route path="/management" element={<ManagementView user={user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            
            <footer className="mt-20 pt-8 border-t border-slate-100 text-center">
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em] mb-2">
                Engineered by <span className="text-slate-400">Harshit Jain</span>
              </p>
              <p className="text-[7px] font-black text-slate-300 uppercase tracking-[0.2em] opacity-40">
                AttendPro Enterprise Ecosystem • Auto Clock-Out Protocol Active
              </p>
            </footer>
          </div>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;