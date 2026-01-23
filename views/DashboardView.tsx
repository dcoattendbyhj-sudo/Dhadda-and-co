
import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole, AttendanceRecord, LeaveRequest, LeaveStatus } from '../types';
import { db } from '../services/db';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Clock, Calendar, AlertTriangle, CheckCircle, Users, Activity, MapPin, DollarSign, FileText, X, ShieldCheck, ChevronRight } from 'lucide-react';

interface DashboardViewProps { user: User; }

const DashboardView: React.FC<DashboardViewProps> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [allAtt, setAllAtt] = useState<AttendanceRecord[]>([]);
  const [allLeave, setAllLeave] = useState<LeaveRequest[]>([]);
  const [showStatusDrawer, setShowStatusDrawer] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [att, leave] = await Promise.all([
          db.getAll<AttendanceRecord>('attendance'),
          db.getAll<LeaveRequest>('leave_requests')
        ]);
        setAllAtt(att);
        setAllLeave(leave);
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const myAtt = allAtt.filter(r => r.userId === user.id);
  const myLate = myAtt.filter(r => r.isLate).length;
  const myApprovedLeave = allLeave.filter(r => r.userId === user.id && r.status === LeaveStatus.APPROVED).length;

  const last7Days = Array.from({length: 7}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const chartData = last7Days.map(date => {
    const records = allAtt.filter(r => r.date === date);
    if (user.role === UserRole.EMPLOYEE) {
      return { date: date.split('-').slice(1).join('/'), count: records.find(r => r.userId === user.id) ? 1 : 0 };
    }
    return { date: date.split('-').slice(1).join('/'), count: records.length };
  });

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-lg transition-all">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-800 tracking-tight">{value}</p>
      </div>
    </div>
  );

  const teamToday = allAtt.filter(r => r.date === todayStr);

  if (loading) return (
    <div className="h-full w-full flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Executive Control</h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] mt-1">Cloud Personnel Management Interface</p>
        </div>
        <div className="flex items-center gap-2 bg-indigo-50 px-5 py-3 rounded-2xl border border-indigo-100 shadow-sm">
          <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Active Operations</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Clock} label="Operational Days" value={myAtt.length} color="bg-indigo-50 text-indigo-600" />
        <StatCard icon={AlertTriangle} label="Anomalies" value={myLate} color="bg-rose-50 text-rose-600" />
        <StatCard icon={CheckCircle} label="Leave Portal" value={myApprovedLeave} color="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-slate-100 border border-slate-50">
          <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
            <Activity size={22} className="text-indigo-600" />
            Attendance Horizon
          </h3>
          <div style={{ width: '100%', height: '288px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: '900', fill: '#94a3b8'}} />
                <YAxis hide />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)'}}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={28}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.count > 0 ? '#4f46e5' : '#e2e8f0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div 
          onClick={() => user.role !== UserRole.EMPLOYEE && setShowStatusDrawer(true)}
          className={`bg-slate-900 p-10 rounded-[2.5rem] shadow-2xl overflow-hidden relative group flex flex-col transition-all ${user.role !== UserRole.EMPLOYEE ? 'cursor-pointer hover:ring-4 hover:ring-indigo-500/20 active:scale-[0.99]' : ''}`}
        >
           <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700"></div>
           <div className="flex justify-between items-center mb-8 relative z-10">
              <h3 className="text-xl font-black text-white flex items-center gap-3">
                {user.role === UserRole.EMPLOYEE ? (
                  <><Calendar size={22} className="text-indigo-400" /> Employment Insights</>
                ) : (
                  <><Users size={22} className="text-indigo-400" /> Personnel Status Feed</>
                )}
              </h3>
              {user.role !== UserRole.EMPLOYEE && <ChevronRight className="text-indigo-400 animate-pulse" />}
           </div>

          <div className="space-y-6 relative z-10 flex-1">
            {user.role === UserRole.EMPLOYEE ? (
              <div className="space-y-4">
                <div className="p-6 bg-white/5 rounded-3xl border border-white/10 flex justify-between items-center group/item hover:bg-white/10 transition-all">
                   <div>
                     <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">Status Report</p>
                     <p className="text-2xl font-black text-white">Active Duty</p>
                   </div>
                   <div className="p-4 bg-indigo-500/20 rounded-2xl text-indigo-400 group-hover/item:scale-110 transition-transform">
                     <ShieldCheck size={24} />
                   </div>
                </div>
                <div className="p-6 bg-white/5 rounded-3xl border border-white/10 flex justify-between items-center group/item hover:bg-white/10 transition-all">
                   <div>
                     <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest mb-1">Compliance Lock</p>
                     <p className="text-2xl font-black text-white">Verified Site</p>
                   </div>
                   <div className="p-4 bg-emerald-500/20 rounded-2xl text-emerald-400 group-hover/item:scale-110 transition-transform">
                     <MapPin size={24} />
                   </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                   <div className="p-8 bg-white/5 rounded-[2rem] border border-white/10 text-center hover:bg-white/10 transition-colors">
                      <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">On-Site Today</p>
                      <p className="text-5xl font-black text-white tracking-tighter">{teamToday.length}</p>
                   </div>
                   <div className="p-8 bg-white/5 rounded-[2rem] border border-white/10 text-center hover:bg-white/10 transition-colors">
                      <p className="text-[10px] font-black text-rose-300 uppercase tracking-widest mb-2">LATE ALERT</p>
                      <p className={`text-5xl font-black tracking-tighter ${teamToday.filter(r => r.isLate).length > 0 ? 'text-rose-400 animate-pulse' : 'text-white'}`}>
                        {teamToday.filter(r => r.isLate).length}
                      </p>
                   </div>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-center">
                  <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Tap to view live operational roster</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Detail Drawer */}
      {showStatusDrawer && (
        <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowStatusDrawer(false)} />
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl p-10 overflow-y-auto animate-in slide-in-from-right duration-500 rounded-l-[3rem]">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Active Personnel</h3>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Live Operational Snapshot</p>
              </div>
              <button onClick={() => setShowStatusDrawer(false)} className="p-4 hover:bg-slate-100 rounded-2xl transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {teamToday.length === 0 ? (
                <div className="py-20 text-center">
                  <Users size={48} className="mx-auto text-slate-100 mb-4" />
                  <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No active check-ins detected.</p>
                </div>
              ) : (
                teamToday.map(r => (
                  <div key={r.id} className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all duration-300">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center font-black text-indigo-600">
                        {r.userName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-slate-900 tracking-tight">{r.userName}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logged: {new Date(r.clockIn).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                      </div>
                    </div>
                    <div>
                      {r.isLate ? (
                        <span className="bg-rose-100 text-rose-600 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest">Late Arrival</span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-600 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest">Nominal</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="mt-12 p-8 bg-indigo-600 rounded-[2.5rem] text-white">
               <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">Operations Summary</p>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold opacity-80">Present</p>
                    <p className="text-3xl font-black">{teamToday.length}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold opacity-80">Absences</p>
                    <p className="text-3xl font-black">--</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
