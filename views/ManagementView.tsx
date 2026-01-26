import React, { useState, useEffect, useMemo } from 'react';
import { Users, MapPin, Plus, Trash2, Clock, Briefcase, DollarSign, Settings, CheckCircle2, ListPlus, X, Calendar, AlertCircle, Search, Download, TrendingUp, ShieldCheck, Eye, Filter, User as UserIcon, Target, Navigation, FileSpreadsheet, Lock, Timer, MapIcon, Layers, Zap } from 'lucide-react';
import { User, UserRole, Location, LeavePolicy, AttendanceRecord, SystemConfig, LeaveType, LeaveRequest, LeaveStatus, LeaveDuration } from '../types';
import { db, supabase } from '../services/db';
import { getCurrentPosition } from '../services/geoService';

interface ManagementViewProps { user: User; }

const ManagementView: React.FC<ManagementViewProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'locations' | 'policies' | 'records' | 'payroll' | 'settings'>('users');
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  
  const [payrollSearch, setPayrollSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState<'all' | 'late' | 'nominal'>('all');

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ id: '', name: '', role: UserRole.EMPLOYEE, password: '', managerId: '' });

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', latitude: 0, longitude: 0, radius: 100 });
  const [isLocating, setIsLocating] = useState(false);

  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [newPolicy, setNewPolicy] = useState<{name: string, targetRole: UserRole}>({
    name: '',
    targetRole: UserRole.EMPLOYEE
  });
  const [newPolicyTypes, setNewPolicyTypes] = useState<Array<{ name: string, days: number }>>([
    { name: 'Annual Leave', days: 20 },
    { name: 'Sick Leave', days: 12 }
  ]);

  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    officialClockInTime: '09:00',
    officialClockOutTime: '18:00',
    companyName: 'AttendPro Enterprise'
  });

  useEffect(() => {
    refreshData();
    const fetchConfig = async () => {
      const { data } = await supabase.from('system_config').select('config').eq('id', 'global').single();
      if (data) setSystemConfig(data.config as any);
    };
    fetchConfig();
  }, [user]);

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allUsers, allLocs, allPolicies, allAtt, allLeaves] = await Promise.all([
        db.getAll<User>('users'),
        db.getAll<Location>('locations'),
        db.getAll<LeavePolicy>('leave_policies'),
        db.getAll<AttendanceRecord>('attendance'),
        db.getAll<LeaveRequest>('leave_requests')
      ]);

      if (user.role === UserRole.BOSS) {
        setManagedUsers(allUsers.filter(u => u.id !== user.id));
        setAttendanceRecords(allAtt);
        setPolicies(allPolicies);
        setAllLeaveRequests(allLeaves);
      } else {
        const myStaff = allUsers.filter(u => u.managerId === user.id);
        setManagedUsers(myStaff);
        const myStaffIds = myStaff.map(s => s.id);
        setAttendanceRecords(allAtt.filter(r => myStaffIds.includes(r.userId)));
        setPolicies(allPolicies.filter(p => p.createdBy === user.id || p.createdBy === 'BOSS'));
        setAllLeaveRequests(allLeaves.filter(r => myStaffIds.includes(r.userId)));
      }
      setLocations(allLocs);
    } catch (err: any) {
      setError(`Sync Failure: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    if (!confirm(`CRITICAL: Purge ${targetUser.name} and ALL historical records? This action is IRREVERSIBLE.`)) return;
    setDeletingUserId(targetUser.id);
    try {
      await supabase.from('attendance').delete().eq('userId', targetUser.id);
      await supabase.from('leave_requests').delete().eq('userId', targetUser.id);
      await supabase.from('notifications').delete().eq('recipientId', targetUser.id);
      const { error: userErr } = await supabase.from('users').delete().eq('id', targetUser.id);
      if (userErr) throw new Error(`Identity purge fault: ${userErr.message}`);
      setSuccess(`${targetUser.name} purged from ecosystem.`);
      await refreshData();
    } catch (err: any) {
      setError(`Purge Failure: ${err.message}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const exportPayrollCSV = () => {
    try {
      const headers = ["Staff ID", "Full Name", "Corporate Role", "Total Days", "Total Hours", "Late Records", "Reliability %"];
      const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
      
      const csvContent = [
        headers.join(","),
        ...payrollStats.map(u => [
          u.id,
          `"${u.name}"`,
          u.role,
          u.totalDays,
          u.totalHours.toFixed(2),
          u.lateCount,
          u.reliability
        ].join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Payroll_Summary_${currentMonth.replace(" ", "_")}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSuccess("Master payroll data exported.");
    } catch (err) {
      setError("Export protocol failed.");
    }
  };

  const exportIndividualDetailedCSV = (targetUser: User) => {
    try {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const userAtt = attendanceRecords.filter(r => r.userId === targetUser.id);
      const userApprovedLeaves = allLeaveRequests.filter(r => r.userId === targetUser.id && r.status === LeaveStatus.APPROVED);
      
      let csvRows = [
        `STAFF PERFORMANCE AUDIT: ${targetUser.name}`,
        `Identity ID: ${targetUser.id}`,
        `Period: ${today.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
        ``,
        `Date,Day,Status,Clock-In,Clock-Out,Hours Worked,Verification`
      ];

      for (let d = new Date(firstDay); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('default', { weekday: 'short' });
        const record = userAtt.find(r => r.date === dateStr);
        
        if (record) {
          const hoursWorked = record.clockOut ? ((new Date(record.clockOut).getTime() - new Date(record.clockIn).getTime()) / (1000 * 60 * 60)) : 0;
          csvRows.push(`${dateStr},${dayLabel},${record.isLate ? 'LATE' : 'PRESENT'},"${new Date(record.clockIn).toLocaleTimeString()}",${record.clockOut ? `"${new Date(record.clockOut).toLocaleTimeString()}"` : "Active"},${hoursWorked.toFixed(2)},BIOMETRIC`);
        } else {
          const leave = userApprovedLeaves.find(l => dateStr >= l.startDate && dateStr <= l.endDate);
          csvRows.push(`${dateStr},${dayLabel},${leave ? 'LEAVE' : 'ABSENT'},-,-,0.00,${leave ? 'AUTHORIZED' : 'MISSING'}`);
        }
      }

      const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `${targetUser.name}_Detailed_Audit.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSuccess(`Detailed audit for ${targetUser.name} exported.`);
    } catch (err) {
      setError("Audit generation failed.");
    }
  };

  const payrollStats = useMemo(() => {
    return managedUsers
      .filter(u => u.name.toLowerCase().includes(payrollSearch.toLowerCase()) || u.id.toLowerCase().includes(payrollSearch.toLowerCase()))
      .map(u => {
        const userAtt = attendanceRecords.filter(r => r.userId === u.id);
        const totalDays = userAtt.length;
        const lateCount = userAtt.filter(r => r.isLate).length;
        const totalHours = userAtt.reduce((acc, r) => {
          if (r.clockIn && r.clockOut) return acc + (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / (1000 * 60 * 60);
          return acc;
        }, 0);
        return { ...u, totalDays, totalHours, lateCount, reliability: totalDays > 0 ? Math.round(((totalDays - lateCount) / totalDays) * 100) : 100 };
      });
  }, [managedUsers, attendanceRecords, payrollSearch]);

  const filteredAudits = useMemo(() => {
    return attendanceRecords
      .filter(r => {
        const matchesSearch = r.userName.toLowerCase().includes(auditSearch.toLowerCase()) || r.userId.toLowerCase().includes(auditSearch.toLowerCase());
        const matchesFilter = auditFilter === 'all' || (auditFilter === 'late' && r.isLate) || (auditFilter === 'nominal' && !r.isLate);
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
  }, [attendanceRecords, auditSearch, auditFilter]);

  const handleFetchCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const pos = await getCurrentPosition();
      setNewLoc(prev => ({
        ...prev,
        latitude: parseFloat(pos.coords.latitude.toFixed(6)),
        longitude: parseFloat(pos.coords.longitude.toFixed(6))
      }));
      setSuccess("Satellite coordinates locked.");
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) { setError('GPS Handshake Failed.'); } finally { setIsLocating(false); }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const loc: Location = {
        id: `loc_${Date.now()}`,
        name: newLoc.name.trim() || 'Site Node',
        latitude: newLoc.latitude,
        longitude: newLoc.longitude,
        radius: newLoc.radius,
        createdBy: user.id
      };
      await db.upsert('locations', loc);
      setShowAddLocation(false);
      setNewLoc({ name: '', latitude: 0, longitude: 0, radius: 100 });
      setSuccess('Zone authorized in perimeter database.');
      refreshData();
    } catch (err: any) { setError(err.message); } finally { setIsProcessing(false); }
  };

  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const types = newPolicyTypes.filter(t => t.name.trim()).map(t => ({
        id: `t_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: t.name,
        maxDays: t.days
      }));
      if (types.length === 0) throw new Error("At least one leave category is required.");
      const pol: LeavePolicy = {
        id: `pol_${Date.now()}`,
        name: newPolicy.name,
        types,
        createdBy: user.id,
        targetRole: newPolicy.targetRole
      };
      await db.upsert('leave_policies', pol);
      setShowAddPolicy(false);
      setNewPolicy({ name: '', targetRole: UserRole.EMPLOYEE });
      setNewPolicyTypes([{ name: 'Annual Leave', days: 20 }, { name: 'Sick Leave', days: 12 }]);
      setSuccess('Policy committed to framework.');
      refreshData();
    } catch (err: any) { setError(err.message); } finally { setIsProcessing(false); }
  };

  const handleUpdatePolicyType = (idx: number, field: 'name' | 'days', val: any) => {
    const next = [...newPolicyTypes];
    next[idx] = { ...next[idx], [field]: val };
    setNewPolicyTypes(next);
  };

  if (loading) return <div className="py-20 text-center font-black">Connecting Secure Database...</div>;

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Team Hub</h1>
          <p className="text-slate-500 font-bold mt-2">Executive oversight and personnel synchronization.</p>
        </div>
        {success && (
          <div className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl flex items-center gap-3 border border-emerald-100 animate-in slide-in-from-top-4">
            <CheckCircle2 size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">{success}</span>
          </div>
        )}
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-[2rem] w-full md:w-max overflow-x-auto no-scrollbar gap-2">
        {[
          { id: 'users', label: 'Identity', icon: Users, roles: [UserRole.BOSS, UserRole.MANAGER] },
          { id: 'payroll', label: 'Payroll', icon: DollarSign, roles: [UserRole.BOSS, UserRole.MANAGER] },
          { id: 'records', label: 'Audits', icon: Clock, roles: [UserRole.BOSS, UserRole.MANAGER] },
          { id: 'locations', label: 'Zones', icon: MapPin, roles: [UserRole.BOSS, UserRole.MANAGER] },
          { id: 'policies', label: 'Policies', icon: Briefcase, roles: [UserRole.BOSS, UserRole.MANAGER] },
          { id: 'settings', label: 'Config', icon: Settings, roles: [UserRole.BOSS] },
        ].map(tab => tab.roles.includes(user.role) && (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setError(null); }}
            className={`flex items-center gap-3 px-8 py-3.5 rounded-2xl text-[11px] font-black tracking-widest uppercase transition-all shrink-0 ${
              activeTab === tab.id ? 'bg-white text-indigo-600 shadow-xl shadow-slate-200' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3.5rem] p-8 md:p-14 shadow-2xl border border-slate-50 min-h-[700px]">
        {error && (
          <div className="mb-10 bg-rose-50 border border-rose-100 text-rose-600 p-6 rounded-3xl flex items-center gap-4 animate-in shake">
            <AlertCircle size={24} className="shrink-0" />
            <p className="text-sm font-black uppercase tracking-tight leading-relaxed">{error}</p>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-10 animate-in fade-in">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Personnel Registry</h3>
              <button onClick={() => setShowAddUser(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl hover:bg-black shadow-xl transition-all flex items-center gap-2">
                <Plus size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">Enroll User</span>
              </button>
            </div>
            {showAddUser && (
              <form onSubmit={async (e) => { e.preventDefault(); setIsProcessing(true); try { await db.upsert('users', { id: newUser.id.trim(), name: newUser.name.trim(), role: newUser.role, password: newUser.password, managerId: newUser.role === UserRole.EMPLOYEE ? (user.role === UserRole.MANAGER ? user.id : newUser.managerId) : undefined, createdAt: Date.now() }); setShowAddUser(false); setSuccess("Identity provisioned successfully."); refreshData(); } catch (err: any) { setError(err.message); } finally { setIsProcessing(false); } }} className="bg-slate-50 p-12 rounded-[3rem] space-y-10 border border-slate-100 animate-in slide-in-from-top-4">
                <div className="grid md:grid-cols-2 gap-10">
                   {['Identity ID', 'Full Name', 'Corporate Role', 'Access Secret'].map((label, idx) => (
                     <div key={label}>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{label}</label>
                        {idx === 2 ? (
                          <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})} className="w-full px-7 py-5 rounded-2xl border border-slate-100 font-black bg-white focus:border-indigo-500 transition-colors shadow-sm">
                            <option value={UserRole.EMPLOYEE}>Standard Employee</option>
                            {user.role === UserRole.BOSS && <option value={UserRole.MANAGER}>Unit Manager</option>}
                          </select>
                        ) : (
                          <input required value={idx === 0 ? newUser.id : idx === 1 ? newUser.name : newUser.password} onChange={e => idx === 0 ? setNewUser({...newUser, id: e.target.value}) : idx === 1 ? setNewUser({...newUser, name: e.target.value}) : setNewUser({...newUser, password: e.target.value})} className="w-full px-7 py-5 rounded-2xl border border-slate-100 font-black focus:border-indigo-500 transition-colors shadow-sm" placeholder={label} />
                        )}
                     </div>
                   ))}
                </div>
                <div className="flex gap-4">
                  <button type="submit" disabled={isProcessing} className="flex-1 bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 transition-all active:scale-95">Verify & Commit</button>
                  <button type="button" onClick={() => setShowAddUser(false)} className="px-12 bg-white border border-slate-200 text-slate-500 py-6 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-50">Cancel</button>
                </div>
              </form>
            )}
            <div className="overflow-x-auto rounded-[2rem] border border-slate-50">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                    <th className="px-8 py-6">Staff Identity</th>
                    <th className="px-8 py-6">Role</th>
                    <th className="px-8 py-6 text-right">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {managedUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-7"><p className="font-black text-slate-900">{u.name}</p><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">{u.id}</p></td>
                      <td className="px-8 py-7"><span className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${u.role === UserRole.MANAGER ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{u.role}</span></td>
                      <td className="px-8 py-7 text-right">
                        <button onClick={() => handleDeleteUser(u)} disabled={deletingUserId === u.id} className="p-3.5 bg-white border border-slate-100 rounded-xl text-slate-300 hover:text-rose-500 hover:border-rose-100 transition-all shadow-sm">
                          {deletingUserId === u.id ? <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div> : <Trash2 size={20} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="space-y-10 animate-in fade-in">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="font-black text-slate-900 text-2xl tracking-tight">Enterprise Ledger</h3>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Monthly operational statistics and summary</p>
              </div>
              <div className="flex items-center gap-4 w-full md:w-max">
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input type="text" placeholder="Personnel search..." value={payrollSearch} onChange={(e) => setPayrollSearch(e.target.value)} className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase tracking-widest outline-none focus:bg-white transition-all shadow-sm" />
                </div>
                <button 
                  onClick={exportPayrollCSV}
                  className="bg-slate-900 text-white p-4 rounded-2xl hover:bg-black transition-all shadow-xl flex items-center gap-3 shrink-0"
                  title="Export All to CSV"
                >
                  <FileSpreadsheet size={22} />
                  <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">Master Export</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-8">
              {payrollStats.map(u => (
                <div key={u.id} className="bg-slate-50 border border-slate-100 p-10 rounded-[3.5rem] flex flex-col md:flex-row items-center justify-between gap-8 hover:bg-white hover:shadow-2xl transition-all duration-500 group">
                  <div className="flex items-center gap-7">
                    <div className="w-20 h-20 bg-white rounded-3xl border border-slate-100 flex items-center justify-center font-black text-indigo-600 text-3xl shadow-sm overflow-hidden ring-4 ring-transparent group-hover:ring-indigo-50 transition-all">
                       {u.profileSelfie ? <img src={u.profileSelfie} className="w-full h-full object-cover" /> : u.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-2xl tracking-tight">{u.name}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white px-2 py-0.5 rounded-md border border-slate-100 mt-1 inline-block">{u.id} • {u.role}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-12 flex-1 md:max-w-2xl px-6">
                    <div className="text-center md:text-left"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-70">Total Hours</p><p className="text-2xl font-black text-slate-900">{u.totalHours.toFixed(1)}h</p></div>
                    <div className="text-center md:text-left"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-70">Day Cycles</p><p className="text-2xl font-black text-indigo-600">{u.totalDays}</p></div>
                    <div className="text-center md:text-left"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-70">Late Entry</p><p className={`text-2xl font-black ${u.lateCount > 0 ? 'text-rose-500' : 'text-slate-900'}`}>{u.lateCount}</p></div>
                    <div className="text-center md:text-left">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-70">Reliability</p>
                      <div className="flex items-center justify-center md:justify-start gap-2">
                        <p className={`text-2xl font-black ${u.reliability > 90 ? 'text-emerald-500' : 'text-amber-500'}`}>{u.reliability}%</p>
                        <TrendingUp size={16} className={u.reliability > 90 ? 'text-emerald-400' : 'text-amber-400'} />
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => exportIndividualDetailedCSV(u)}
                    className="px-6 py-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm active:scale-95"
                  >
                    Generate Audit
                  </button>
                </div>
              ))}
              {payrollStats.length === 0 && (
                <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[3rem]">
                   <DollarSign size={48} className="mx-auto text-slate-100 mb-6" />
                   <p className="text-slate-400 font-black uppercase text-xs tracking-[0.3em]">No matching personnel for payroll export</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'records' && (
          <div className="space-y-10 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="font-black text-slate-900 text-2xl tracking-tight">System Audit Ledger</h3>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Real-time biometric authentication stream</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-max">
                <div className="relative flex-1 sm:w-64">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                   <input type="text" placeholder="Personnel search..." value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black uppercase tracking-widest outline-none focus:bg-white transition-all shadow-sm" />
                </div>
                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                   {['all', 'late', 'nominal'].map(f => (
                     <button key={f} onClick={() => setAuditFilter(f as any)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${auditFilter === f ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{f}</button>
                   ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {filteredAudits.map(r => (
                <div key={r.id} className="group p-8 bg-slate-50 border border-slate-100 rounded-[3rem] flex flex-col lg:flex-row lg:items-center justify-between gap-8 hover:bg-white hover:shadow-2xl hover:shadow-indigo-100/30 transition-all duration-500">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-white rounded-3xl border border-slate-100 flex items-center justify-center font-black text-3xl text-indigo-600 shadow-sm overflow-hidden ring-4 ring-transparent group-hover:ring-indigo-50 transition-all">
                       {r.selfieBase64?.startsWith('data:image') ? <img src={r.selfieBase64.split(' ')[0]} className="w-full h-full object-cover" /> : r.userName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-black text-slate-900 text-2xl tracking-tight">{r.userName}</p>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest bg-white px-2 py-0.5 rounded-md border border-slate-100">{r.userId}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-6 mt-3">
                        <div className="flex items-center gap-2.5 text-slate-500 font-black text-[11px] uppercase tracking-widest">
                           <Calendar size={14} className="text-indigo-400" /> {r.date}
                        </div>
                        <div className="flex items-center gap-2.5 text-slate-500 font-black text-[11px] uppercase tracking-widest">
                           <Timer size={14} className="text-indigo-400" /> IN: {new Date(r.clockIn).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                        </div>
                        {r.clockOut && (
                          <div className="flex items-center gap-2.5 text-slate-500 font-black text-[11px] uppercase tracking-widest">
                            <Zap size={14} className="text-amber-400" /> OUT: {new Date(r.clockOut).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="px-6 py-4 bg-white border border-slate-100 rounded-[2rem] flex flex-col shadow-sm min-w-[160px]">
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Status Protocol</p>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${r.isLate ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {r.isLate ? 'Anomalous Entry' : 'Nominal Presence'}
                      </span>
                    </div>
                    <div className="px-6 py-4 bg-white border border-slate-100 rounded-[2rem] flex flex-col min-w-[160px] shadow-sm">
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Biometric Trust</p>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${r.isLate ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} style={{ width: '99%' }}></div>
                        </div>
                        <span className="text-[10px] font-black text-slate-700">99%</span>
                      </div>
                    </div>
                    <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center transition-all shadow-sm ${r.isLate ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                      {r.isLate ? <AlertCircle size={26} /> : <ShieldCheck size={26} />}
                    </div>
                  </div>
                </div>
              ))}
              {filteredAudits.length === 0 && (
                <div className="py-28 text-center border-2 border-dashed border-slate-100 rounded-[4rem]">
                   <Layers size={56} className="mx-auto text-slate-100 mb-6" />
                   <p className="text-slate-400 font-black uppercase text-xs tracking-[0.4em]">No matching ledger entries found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'locations' && (
          <div className="space-y-10 animate-in fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-900 text-2xl tracking-tight">Geofence Registry</h3>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Authorized site perimeters and entry nodes</p>
              </div>
              <button onClick={() => setShowAddLocation(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl hover:bg-indigo-700 shadow-xl transition-all flex items-center gap-2">
                <Plus size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">Authorize Zone</span>
              </button>
            </div>
            {showAddLocation && (
              <form onSubmit={handleAddLocation} className="bg-slate-50 p-12 rounded-[3rem] space-y-10 border border-slate-100 animate-in slide-in-from-top-4">
                <div className="grid md:grid-cols-2 gap-10">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Zone Identity / Site Name</label>
                    <input required value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} className="w-full px-7 py-5 rounded-2xl border border-slate-100 font-black shadow-sm" placeholder="Corporate HQ / Site Alpha" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Latitude</label>
                    <input required type="number" step="any" value={newLoc.latitude} onChange={e => setNewLoc({...newLoc, latitude: parseFloat(e.target.value)})} className="w-full px-7 py-5 rounded-2xl border border-slate-100 font-black shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Longitude</label>
                    <input required type="number" step="any" value={newLoc.longitude} onChange={e => setNewLoc({...newLoc, longitude: parseFloat(e.target.value)})} className="w-full px-7 py-5 rounded-2xl border border-slate-100 font-black shadow-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Authorized Radius (Meters)</label>
                    <div className="flex items-center gap-6">
                       <input required type="number" min="10" max="10000" value={newLoc.radius} onChange={e => setNewLoc({...newLoc, radius: parseInt(e.target.value)})} className="w-full px-7 py-5 rounded-2xl border border-slate-100 font-black shadow-sm" />
                       <div className="flex flex-col">
                          <span className="text-slate-400 font-black text-[9px] uppercase tracking-widest">Current Range</span>
                          <span className="text-indigo-600 font-black text-xs uppercase tracking-widest">{newLoc.radius}m</span>
                       </div>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <button type="button" onClick={handleFetchCurrentLocation} disabled={isLocating} className="w-full py-6 bg-white border-2 border-dashed border-indigo-100 text-indigo-600 rounded-3xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-indigo-50 transition-all shadow-sm">
                      {isLocating ? <div className="w-6 h-6 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div> : <Navigation size={22} />}
                      Execute Satellite Lock
                    </button>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 transition-all active:scale-95">Authorize perimeter</button>
                  <button type="button" onClick={() => setShowAddLocation(false)} className="px-12 bg-white border border-slate-200 text-slate-500 py-6 rounded-2xl font-black uppercase tracking-widest text-xs">Abort</button>
                </div>
              </form>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {locations.map(loc => (
                <div key={loc.id} className="p-10 bg-slate-50 border border-slate-100 rounded-[3.5rem] hover:bg-white hover:shadow-2xl transition-all duration-500 group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-8 relative z-10">
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100"><MapPin size={32} /></div>
                    <button onClick={async () => { if (confirm('Decommission zone perimeter?')) { await db.delete('locations', loc.id); refreshData(); } }} className="p-3 text-slate-200 hover:text-rose-500 transition-colors"><Trash2 size={24} /></button>
                  </div>
                  <p className="font-black text-slate-900 text-2xl tracking-tight mb-2 relative z-10">{loc.name}</p>
                  <div className="flex items-center gap-2 mb-6 relative z-10">
                    <MapIcon size={14} className="text-slate-300" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}</span>
                  </div>
                  <div className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 relative z-10 border border-indigo-100/50">
                    <Target size={12} /> Perimeter: {loc.radius}m
                  </div>
                  <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-indigo-600/5 rounded-full blur-2xl group-hover:bg-indigo-600/10 transition-all"></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'policies' && (
          <div className="space-y-10 animate-in fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-900 text-2xl tracking-tight">Absence Governance</h3>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Define leave types and specific day allotments</p>
              </div>
              <button onClick={() => setShowAddPolicy(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl hover:bg-indigo-700 shadow-xl transition-all flex items-center gap-2">
                <Plus size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">New Framework</span>
              </button>
            </div>
            {showAddPolicy && (
              <form onSubmit={handleAddPolicy} className="bg-slate-50 p-12 rounded-[3.5rem] space-y-10 border border-slate-100 animate-in slide-in-from-top-4">
                <div className="grid md:grid-cols-2 gap-10">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Policy Identity (e.g., Corporate 2025)</label>
                    <input required value={newPolicy.name} onChange={e => setNewPolicy({...newPolicy, name: e.target.value})} className="w-full px-7 py-5 rounded-2xl border border-slate-100 font-black shadow-sm" placeholder="Policy Name" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Governance Role</label>
                    <div className="flex gap-4">
                      {[UserRole.EMPLOYEE, UserRole.MANAGER].map(role => (
                        <button key={role} type="button" onClick={() => setNewPolicy({...newPolicy, targetRole: role})} className={`flex-1 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest border transition-all ${newPolicy.targetRole === role ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'}`}>{role}S</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-6 pt-6 border-t border-slate-100">
                  <div className="flex justify-between items-center px-1">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Absence Categories & Allotments</label>
                    <button type="button" onClick={() => setNewPolicyTypes([...newPolicyTypes, { name: '', days: 0 }])} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 hover:opacity-70 transition-opacity"><ListPlus size={16} /> Add Category</button>
                  </div>
                  <div className="grid gap-5">
                    {newPolicyTypes.map((type, idx) => (
                      <div key={idx} className="flex gap-5 animate-in slide-in-from-left-2">
                        <input required value={type.name} onChange={e => handleUpdatePolicyType(idx, 'name', e.target.value)} className="flex-1 px-6 py-4 rounded-2xl border border-slate-100 font-black shadow-sm" placeholder="Leave Name (e.g., Parental)" />
                        <div className="relative w-36">
                          <input required type="number" value={type.days} onChange={e => handleUpdatePolicyType(idx, 'days', parseInt(e.target.value))} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-center shadow-sm" />
                          <span className="absolute -top-3 left-4 bg-slate-50 px-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Max Days</span>
                        </div>
                        <button type="button" onClick={() => setNewPolicyTypes(newPolicyTypes.filter((_, i) => i !== idx))} className="p-4 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"><X size={22} /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4 pt-6 border-t border-slate-100">
                  <button type="submit" disabled={isProcessing} className="flex-1 bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 transition-all active:scale-95">Synchronize Framework</button>
                  <button type="button" onClick={() => setShowAddPolicy(false)} className="px-12 bg-white border border-slate-200 text-slate-500 py-6 rounded-2xl font-black uppercase tracking-widest text-xs">Cancel</button>
                </div>
              </form>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {policies.map(p => (
                <div key={p.id} className="p-10 bg-slate-50 border border-slate-100 rounded-[3.5rem] hover:bg-white hover:shadow-2xl transition-all duration-500 group">
                   <div className="flex justify-between items-start mb-8">
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100"><Briefcase size={32} /></div>
                    <button onClick={async () => { if (confirm('Purge policy framework?')) { await db.delete('leave_policies', p.id); refreshData(); } }} className="p-3 text-slate-200 hover:text-rose-500 transition-colors"><Trash2 size={24} /></button>
                  </div>
                  <p className="font-black text-slate-900 text-2xl tracking-tight mb-2">{p.name}</p>
                  <span className="px-4 py-1.5 bg-indigo-100 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest mb-8 inline-block border border-indigo-200/50">{p.targetRole}S</span>
                  <div className="space-y-4 pt-8 border-t border-slate-100/60">
                    {p.types?.map(t => (
                      <div key={t.id} className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest">
                         <span className="text-slate-400">{t.name}</span>
                         <span className="text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm">{t.maxDays} Days</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && user.role === UserRole.BOSS && (
          <form onSubmit={async (e) => { e.preventDefault(); setIsProcessing(true); try { await supabase.from('system_config').update({ config: systemConfig }).eq('id', 'global'); setSuccess('Global parameters synchronized.'); setTimeout(() => setSuccess(null), 3000); } catch (err: any) { setError(err.message); } finally { setIsProcessing(false); } }} className="space-y-12 animate-in fade-in max-w-4xl">
            <h3 className="font-black text-slate-900 text-2xl tracking-tight">System Global Parameters</h3>
            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Daily Threshold Clock-In</label>
                <input required type="time" value={systemConfig.officialClockInTime} onChange={e => setSystemConfig({...systemConfig, officialClockInTime: e.target.value})} className="w-full px-8 py-6 rounded-3xl bg-slate-50 border border-slate-100 font-black outline-none focus:bg-white focus:border-indigo-500 transition-all shadow-sm" />
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Auto-Terminate Protocol Time</label>
                <input required type="time" value={systemConfig.officialClockOutTime} onChange={e => setSystemConfig({...systemConfig, officialClockOutTime: e.target.value})} className="w-full px-8 py-6 rounded-3xl bg-slate-50 border border-slate-100 font-black outline-none focus:bg-white focus:border-indigo-500 transition-all shadow-sm" />
              </div>
            </div>
            <button type="submit" disabled={isProcessing} className="bg-indigo-600 text-white px-12 py-7 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.25em] shadow-2xl shadow-indigo-100 active:scale-95 transition-all flex items-center gap-4">
              {isProcessing ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> : <Settings size={22} />}
              Synchronize Infrastructure
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ManagementView;