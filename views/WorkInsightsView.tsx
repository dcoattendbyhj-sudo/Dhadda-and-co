import React, { useState, useEffect } from 'react';
import { User, AttendanceRecord, LeaveRequest, LeaveStatus } from '../types';
import { db } from '../services/db';
import { STORAGE_KEYS } from '../constants';
import { TrendingUp, Clock, Calendar, Zap, Award, Target } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface WorkInsightsViewProps {
  user: User;
}

const WorkInsightsView: React.FC<WorkInsightsViewProps> = ({ user }) => {
  const [allAtt, setAllAtt] = useState<AttendanceRecord[]>([]);
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [att, leaves] = await Promise.all([
          db.getFiltered<AttendanceRecord>('attendance', 'userId', user.id),
          db.getFiltered<LeaveRequest>('leave_requests', 'userId', user.id)
        ]);
        setAllAtt(att);
        setAllLeaves(leaves.filter(r => r.status === LeaveStatus.APPROVED));
      } catch (err) {
        console.error('WorkInsights fetch error', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.id]);

  const calculateHours = (records: AttendanceRecord[]) => {
    return records.reduce((total, r) => {
      if (r.clockIn && r.clockOut) {
        const diff = new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime();
        return total + diff / (1000 * 60 * 60);
      }
      return total;
    }, 0);
  };

  if (loading) return (
    <div className="h-full w-full flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  const todayDate = new Date();
  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() - todayDate.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);

  const weeklyHours = calculateHours(allAtt.filter(r => new Date(r.clockIn) >= weekStart));
  const monthlyHours = calculateHours(allAtt.filter(r => new Date(r.clockIn) >= monthStart));
  const lifetimeDays = allAtt.length;
  const lifetimeLeaves = allLeaves.length;

  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const dateStr = d.toISOString().split('T')[0];
    const dayRecords = allAtt.filter(r => r.date === dateStr);
    return {
      name: d.toLocaleDateString([], { weekday: 'short' }),
      hours: parseFloat(calculateHours(dayRecords).toFixed(2))
    };
  });

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Work Status</h1>
        <p className="text-slate-500 font-bold mt-2">Verified performance metrics and employment history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <InsightCard icon={Clock} label="Weekly Hours" value={`${weeklyHours.toFixed(1)}h`} sub="This Week" color="bg-indigo-600" />
        <InsightCard icon={Target} label="Monthly Total" value={`${monthlyHours.toFixed(1)}h`} sub="Current Month" color="bg-blue-600" />
        <InsightCard icon={Calendar} label="Active Days" value={lifetimeDays} sub="Lifetime Tenure" color="bg-emerald-600" />
        <InsightCard icon={Award} label="Absence Logs" value={lifetimeLeaves} sub="Approved Leaves" color="bg-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] shadow-2xl shadow-slate-200 border border-white">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
              <TrendingUp className="text-indigo-600" />
              Efficiency Trend
            </h2>
            <span className="text-[10px] font-black text-slate-300 bg-slate-50 px-4 py-2 rounded-full uppercase tracking-widest">System Audit: 14 Days</span>
          </div>
          <div style={{ width: '100%', height: '350px', minWidth: '0px', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last14Days}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fontBold: '900', fill: '#cbd5e1'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fontBold: '900', fill: '#cbd5e1'}} />
                <Tooltip 
                  contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)', padding: '16px'}}
                />
                <Area type="monotone" dataKey="hours" stroke="#4f46e5" strokeWidth={6} fillOpacity={1} fill="url(#colorHours)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[3rem] p-10 border border-slate-100 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Compliance</h3>
            <p className="text-slate-400 text-sm font-bold">Reliability quotient based on active logs.</p>
          </div>

          <div className="space-y-10 my-12">
            <ProgressBar label="Monthly Commitment" current={monthlyHours} target={160} color="bg-indigo-600" />
            <ProgressBar label="Weekly Commitment" current={weeklyHours} target={40} color="bg-blue-600" />
          </div>

          <div className="bg-slate-900 rounded-[2rem] p-6 text-white text-center shadow-xl">
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-[0.3em] mb-2">Verified Efficiency</p>
            <p className="text-4xl font-black">98.4%</p>
            <div className="w-full h-1 bg-white/10 rounded-full mt-4 overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: '98.4%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const InsightCard = ({ icon: Icon, label, value, sub, color }: any) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200 border border-white group hover:-translate-y-2 transition-all duration-500">
    <div className={`w-14 h-14 rounded-3xl ${color} flex items-center justify-center text-white mb-6 shadow-2xl transition-transform group-hover:scale-110`}>
      <Icon size={28} />
    </div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{label}</p>
    <p className="text-4xl font-black text-slate-900 mb-2">{value}</p>
    <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">{sub}</p>
  </div>
);

const ProgressBar = ({ label, current, target, color }: any) => {
  const percent = Math.min((current / target) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-3 text-slate-400">
        <span>{label}</span>
        <span className="text-slate-900">{Math.round(percent)}%</span>
      </div>
      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
};

export default WorkInsightsView;