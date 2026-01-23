import React, { useState, useEffect, useMemo } from 'react';
import { Users, MapPin, Plus, Trash2, Clock, Briefcase, DollarSign, Settings, CheckCircle2, ListPlus, X, Calendar, AlertCircle, Search, Download, TrendingUp, ShieldCheck, Eye, Filter, User as UserIcon, Target } from 'lucide-react';
import { User, UserRole, Location, LeavePolicy, AttendanceRecord, SystemConfig, LeaveType } from '../types';
import { db, supabase } from '../services/db';
import { getCurrentPosition } from '../services/geoService';

interface ManagementViewProps { user: User; }

const ManagementView: React.FC<ManagementViewProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'locations' | 'policies' | 'records' | 'payroll' | 'settings'>('users');
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Search and Filter States
  const [payrollSearch, setPayrollSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState<'all' | 'late' | 'nominal'>('all');

  // Add Item Modals/States
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
    try {
      const [allUsers, allLocs, allPolicies, allAtt] = await Promise.all([
        db.getAll<User>('users'),
        db.getAll<Location>('locations'),
        db.getAll<LeavePolicy>('leave_policies'),
        db.getAll<AttendanceRecord>('attendance')
      ]);

      if (user.role === UserRole.BOSS) {
        setManagedUsers(allUsers.filter(u => u.id !== user.id));
        setAttendanceRecords(allAtt);
        setPolicies(allPolicies);
      } else {
        const myStaff = allUsers.filter(u => u.managerId === user.id);
        setManagedUsers(myStaff);
        const myStaffIds = myStaff.map(s => s.id);
        setAttendanceRecords(allAtt.filter(r => myStaffIds.includes(r.userId)));
        setPolicies(allPolicies.filter(p => p.createdBy === user.id || p.createdBy === 'BOSS'));
      }

      setLocations(allLocs);
    } catch (err: any) {
      setError(`Sync Failure: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicy.name.trim()) return setError("Policy name required.");
    setIsProcessing(true);
    try {
      const policyTypes: LeaveType[] = newPolicyTypes.map(item => ({
        id: `type_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: item.name.trim(),
        maxDays: item.days
      }));

      const created: LeavePolicy = {
        id: `pol_${Date.now()}`,
        name: newPolicy.name.trim(),
        types: policyTypes,
        createdBy: user.id,
        targetRole: newPolicy.targetRole
      };

      await db.upsert('leave_policies', created);
      setShowAddPolicy(false);
      setSuccess('Personnel absence policy established.');
      refreshData();
    } catch (err: any) {
      setError(`Policy Fault: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateTypeRow = (index: number, field: 'name' | 'days', value: string | number) => {
    const updated = [...newPolicyTypes];
    if (index === newPolicyTypes.length) {
      updated.push({ 
        name: field === 'name' ? (value as string) : '', 
        days: field === 'days' ? (value as number) : 0 
      });
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setNewPolicyTypes(updated);
  };

  const handleRemoveTypeRow = (index: number) => {
    if (newPolicyTypes.length > 1) {
      setNewPolicyTypes(newPolicyTypes.filter((_, i) => i !== index));
    } else {
      setError("A policy must have at least one leave category.");
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
          if (r.clockIn && r.clockOut) {
            return acc + (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / (1000 * 60 * 60);
          }
          return acc;
        }, 0);
        const complianceScore = totalDays > 0 ? Math.round(((totalDays - lateCount) / totalDays) * 100) : 100;
        return { ...u, totalDays, totalHours, lateCount, complianceScore };
      });
  }, [managedUsers, attendanceRecords, payrollSearch]);

  const filteredAudits = useMemo(() => {
    return attendanceRecords
      .filter(r => {
        const matchesSearch = r.userName.toLowerCase().includes(auditSearch.toLowerCase()) || r.userId.toLowerCase().includes(auditSearch.toLowerCase());
        const matchesFilter = 
          auditFilter === 'all' || 
          (auditFilter === 'late' && r.isLate) || 
          (auditFilter === 'nominal' && !r.isLate);
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
  }, [attendanceRecords, auditSearch, auditFilter]);

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      await supabase.from('system_config').update({ config: systemConfig }).eq('id', 'global');
      setSuccess('Operational parameters synchronized.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFetchCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const pos = await getCurrentPosition();
      setNewLoc(prev => ({
        ...prev,
        latitude: parseFloat(pos.coords.latitude.toFixed(6)),
        longitude: parseFloat(pos.coords.longitude.toFixed(6))
      }));
      setSuccess("GPS satellite lock acquired.");
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError('GPS Fault.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const loc: Location = {
        id: `loc_${Date.now()}`,
        name: newLoc.name || 'Site Node',
        latitude: newLoc.latitude,
        longitude: newLoc.longitude,
        radius: newLoc.radius,
        createdBy: user.id
      };
      await db.upsert('locations', loc);
      setShowAddLocation(false);
      setNewLoc({ name: '', latitude: 0, longitude: 0, radius: 100 });
      refreshData();
      setSuccess("Site zone successfully authorized.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      let finalManagerId = user.role === UserRole.MANAGER ? user.id : newUser.managerId;
      const created: User = {
        id: newUser.id.trim(),
        name: newUser.name.trim(),
        role: newUser.role,
        password: newUser.password,
        managerId: newUser.role === UserRole.EMPLOYEE ? (finalManagerId || undefined) : undefined,
        createdAt: Date.now()
      };
      await db.upsert('users', created);
      setShowAddUser(false);
      refreshData();
      setSuccess("New identity provisioned in registry.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className="py-20 text-center font-black">Syncing Team Data...</div>;

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Team Hub</h1>
          <p className="text-slate-500 font-bold mt-2">Centralized administrative control and cloud oversight.</p>
        </div>
        {success && (
          <div className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl flex items-center gap-3 border border-emerald-100 animate-in slide-in-from-top-4">
            <CheckCircle2 size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">{success}</span>
          </div>
        )}
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-[1.5rem] w-full md:w-max overflow-x-auto no-scrollbar gap-2">
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
            className={`flex items-center gap-3 px-8 py-3 rounded-2xl text-[11px] font-black tracking-widest uppercase transition-all shrink-0 ${
              activeTab === tab.id ? 'bg-white text-indigo-600 shadow-xl shadow-slate-200' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3rem] p-6 md:p-12 shadow-2xl shadow-slate-200 border border-white min-h-[600px]">
        {error && (
          <div className="mb-8 bg-rose-50 border border-rose-100 text-rose-600 p-6 rounded-2xl flex items-center gap-4 animate-in shake">
            <AlertCircle size={24} />
            <p className="text-sm font-black uppercase tracking-tight">{error}</p>
          </div>
        )}

        {/* --- USERS TAB --- */}
        {activeTab === 'users' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Staff Directory</h3>
              <button onClick={() => setShowAddUser(true)} className="bg-indigo-600 text-white p-4 rounded-3xl hover:bg-indigo-700 shadow-xl transition-all flex items-center gap-2">
                <Plus size={24} />
                <span className="md:inline hidden text-[10px] font-black uppercase tracking-widest mr-2">Provision User</span>
              </button>
            </div>
            {showAddUser && (
              <form onSubmit={handleAddUser} className="bg-slate-50 p-10 rounded-[2.5rem] space-y-8 border border-slate-100 animate-in slide-in-from-top-4">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Corporate ID</label>
                    <input required value={newUser.id} onChange={e => setNewUser({...newUser, id: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700" placeholder="EMP-001" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Legal Name</label>
                    <input required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700" placeholder="Staff Name" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Role</label>
                    <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black bg-white">
                      <option value={UserRole.EMPLOYEE}>Standard Employee</option>
                      {user.role === UserRole.BOSS && <option value={UserRole.MANAGER}>Unit Manager</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Password</label>
                    <input required type="text" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black" placeholder="Access Token" />
                  </div>
                </div>
                <div className="flex gap-4">
                  <button type="submit" disabled={isProcessing} className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs">Commit Identity</button>
                  <button type="button" onClick={() => setShowAddUser(false)} className="px-10 bg-white border border-slate-200 text-slate-600 py-5 rounded-2xl font-black uppercase tracking-widest text-xs">Cancel</button>
                </div>
              </form>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-slate-50 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
                    <th className="pb-6">Personnel</th>
                    <th className="pb-6">Designation</th>
                    <th className="pb-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {managedUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-6 font-black text-slate-900">{u.name} <span className="text-slate-300 ml-2">({u.id})</span></td>
                      <td className="py-6"><span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${u.role === UserRole.MANAGER ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{u.role}</span></td>
                      <td className="py-6 text-right"><button onClick={async () => { if (confirm('Terminate identity?')) { await db.delete('users', u.id); refreshData(); } }} className="text-slate-200 hover:text-rose-500 p-2"><Trash2 size={18} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- PAYROLL TAB --- */}
        {activeTab === 'payroll' && (
          <div className="space-y-10 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Financial Ledger</h3>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input 
                  type="text" 
                  placeholder="Filter personnel..." 
                  value={payrollSearch}
                  onChange={(e) => setPayrollSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-600 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {payrollStats.map(u => (
                <div key={u.id} className="group bg-slate-50 hover:bg-white hover:shadow-2xl hover:shadow-indigo-100/50 border border-slate-100 rounded-[2rem] p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 transition-all duration-500">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white rounded-3xl border border-slate-100 flex items-center justify-center font-black text-2xl text-indigo-600 shadow-sm">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-lg tracking-tight">{u.name}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{u.id} • {u.role}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-8 flex-1 md:max-w-2xl">
                    <div className="text-center md:text-left">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Work Hours</p>
                      <p className="text-xl font-black text-slate-900">{u.totalHours.toFixed(1)}h</p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Days</p>
                      <p className="text-xl font-black text-indigo-600">{u.totalDays}</p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Anomalies</p>
                      <p className={`text-xl font-black ${u.lateCount > 0 ? 'text-rose-500' : 'text-slate-900'}`}>{u.lateCount}</p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Compliance</p>
                      <div className="flex items-center gap-2 justify-center md:justify-start">
                         <span className={`text-xl font-black ${u.complianceScore > 90 ? 'text-emerald-500' : 'text-amber-500'}`}>{u.complianceScore}%</span>
                         <TrendingUp size={14} className={u.complianceScore > 90 ? 'text-emerald-400' : 'text-amber-400'} />
                      </div>
                    </div>
                  </div>
                  <button className="px-6 py-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all">
                    Generate Pay-Slip
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- AUDITS (RECORDS) TAB --- */}
        {activeTab === 'records' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="font-black text-slate-900 text-2xl tracking-tight">System Audit Log</h3>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Full operational check-in history</p>
              </div>
              <div className="flex items-center gap-4 w-full md:w-max">
                <div className="relative flex-1 md:w-64">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                   <input 
                    type="text" 
                    placeholder="Search personnel..." 
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-black uppercase tracking-widest text-slate-700 focus:bg-white outline-none transition-all"
                   />
                </div>
                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                   {[
                     { id: 'all', label: 'All' },
                     { id: 'late', label: 'Anomalies' },
                     { id: 'nominal', label: 'Nominal' }
                   ].map(f => (
                     <button 
                       key={f.id}
                       onClick={() => setAuditFilter(f.id as any)}
                       className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${auditFilter === f.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                       {f.label}
                     </button>
                   ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto -mx-6 md:mx-0">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-slate-50 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
                    <th className="pb-6 px-6">Personnel</th>
                    <th className="pb-6">Date & Schedule</th>
                    <th className="pb-6">Arrival Identity</th>
                    <th className="pb-6 text-right px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredAudits.map(r => (
                    <tr key={r.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-6 px-6">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center font-black text-slate-400 group-hover:text-indigo-600 transition-colors shadow-sm">
                             <UserIcon size={18} />
                           </div>
                           <div>
                             <p className="font-black text-slate-900 tracking-tight">{r.userName}</p>
                             <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{r.userId}</p>
                           </div>
                        </div>
                      </td>
                      <td className="py-6">
                         <div className="flex flex-col gap-1">
                            <p className="text-sm font-black text-slate-700">{r.date}</p>
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                               <Clock size={12} className="text-indigo-400" />
                               {new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                               {r.clockOut ? ` — ${new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (In Progress)'}
                            </div>
                         </div>
                      </td>
                      <td className="py-6">
                         <div className="flex items-center gap-4">
                            {r.selfieBase64 && r.selfieBase64.startsWith('data:') ? (
                              <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shadow-sm group-hover:border-indigo-200">
                                 <img src={r.selfieBase64} alt="Identity" className="w-full h-full object-cover scale-150" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
                                 <ShieldCheck size={18} />
                              </div>
                            )}
                            <div className="flex flex-col gap-0.5">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Biometric Lock</p>
                               <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600">
                                  <MapPin size={10} />
                                  <span className="truncate max-w-[120px]">Authorized Zone</span>
                               </div>
                            </div>
                         </div>
                      </td>
                      <td className="py-6 text-right px-6">
                        {r.isLate ? (
                          <div className="inline-flex items-center gap-2 bg-rose-50 text-rose-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100 animate-in zoom-in">
                             <AlertCircle size={14} />
                             Anomalous Arrival
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                             <CheckCircle2 size={14} />
                             Nominal Entry
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAudits.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-20 text-center">
                        <Clock size={48} className="mx-auto text-slate-100 mb-4" />
                        <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No audit records found in ledger.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- LOCATIONS (ZONES) TAB --- */}
        {activeTab === 'locations' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-900 text-2xl tracking-tight">Geofence Registry</h3>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Authorized work zones and satellite perimeters</p>
              </div>
              <button onClick={() => setShowAddLocation(true)} className="bg-indigo-600 text-white p-4 rounded-3xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center gap-2">
                <Plus size={28} />
                <span className="md:inline hidden text-xs font-black uppercase tracking-widest mr-2">Authorize Site</span>
              </button>
            </div>

            {showAddLocation && (
              <form onSubmit={handleAddLocation} className="bg-slate-50 p-10 rounded-[3rem] space-y-8 border border-slate-100 animate-in slide-in-from-top-4 duration-500">
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Site Identification Name</label>
                    <input required value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none focus:border-indigo-500 transition-colors" placeholder="e.g., HQ - Silicon Valley" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Latitude</label>
                    <input required type="number" step="any" value={newLoc.latitude} onChange={e => setNewLoc({...newLoc, latitude: parseFloat(e.target.value)})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none focus:border-indigo-500 transition-colors" placeholder="0.000000" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Longitude</label>
                    <input required type="number" step="any" value={newLoc.longitude} onChange={e => setNewLoc({...newLoc, longitude: parseFloat(e.target.value)})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none focus:border-indigo-500 transition-colors" placeholder="0.000000" />
                  </div>
                  <div className="md:col-span-2">
                    <button 
                      type="button" 
                      onClick={handleFetchCurrentLocation} 
                      disabled={isLocating}
                      className="w-full py-5 bg-white border-2 border-dashed border-indigo-100 text-indigo-600 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-4 hover:bg-indigo-50 transition-all hover:border-indigo-200"
                    >
                      {isLocating ? <div className="w-5 h-5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div> : <MapPin size={20} />}
                      {isLocating ? "Acquiring Satellite Lock..." : "Pull Current Satellite Coordinates"}
                    </button>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Authorized Radius (Meters)</label>
                    <div className="flex items-center gap-6">
                       <input required type="number" min="10" value={newLoc.radius} onChange={e => setNewLoc({...newLoc, radius: parseInt(e.target.value)})} className="w-32 px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none focus:border-indigo-500 transition-colors" />
                       <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">Suggested: 100m for standard office environments</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4 border-t border-slate-200/50">
                  <button type="submit" disabled={isProcessing} className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 uppercase tracking-widest text-xs">Authorize Zone Perimeter</button>
                  <button type="button" onClick={() => setShowAddLocation(false)} className="px-10 bg-white border border-slate-200 text-slate-600 py-5 rounded-2xl font-black uppercase tracking-widest text-xs">Cancel</button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {locations.map(loc => (
                <div key={loc.id} className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] flex flex-col justify-between group hover:bg-white hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500 hover:-translate-y-1">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 bg-white rounded-2xl border border-slate-100 flex items-center justify-center text-indigo-600 shadow-sm group-hover:scale-110 transition-transform">
                       <MapPin size={24} />
                    </div>
                    <button onClick={async () => { if (confirm('Decommission site zone?')) { await db.delete('locations', loc.id); refreshData(); } }} className="text-slate-200 hover:text-rose-500 p-2 transition-colors"><Trash2 size={20} /></button>
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-xl tracking-tight mb-2">{loc.name}</p>
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-2">
                         <Target size={12} className="text-slate-200" />
                         {loc.latitude}, {loc.longitude}
                      </p>
                      <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest flex items-center gap-2">
                         <ShieldCheck size={12} className="text-indigo-400" />
                         Radius: {loc.radius}m Safe Zone
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {locations.length === 0 && !showAddLocation && (
                <div className="md:col-span-3 py-20 text-center">
                  <MapPin size={48} className="mx-auto text-slate-100 mb-4" />
                  <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No site perimeters registered in registry.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- POLICIES TAB --- */}
        {activeTab === 'policies' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Absence Frameworks</h3>
              <button onClick={() => setShowAddPolicy(true)} className="bg-indigo-600 text-white p-4 rounded-3xl hover:bg-indigo-700 shadow-xl transition-all flex items-center gap-2">
                <Plus size={28} />
                <span className="md:inline hidden text-xs font-black uppercase tracking-widest mr-2">New Policy</span>
              </button>
            </div>
            {showAddPolicy && (
              <form onSubmit={handleAddPolicy} className="bg-slate-50 p-10 rounded-[2.5rem] space-y-8 border border-slate-100 animate-in slide-in-from-top-4">
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Policy Identity</label>
                    <input required value={newPolicy.name} onChange={e => setNewPolicy({...newPolicy, name: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700" placeholder="Corporate 2025" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Personnel Role</label>
                    <div className="grid grid-cols-2 gap-4">
                      {[UserRole.EMPLOYEE, UserRole.MANAGER].map(role => (
                        <button 
                          key={role}
                          type="button"
                          onClick={() => setNewPolicy({...newPolicy, targetRole: role})}
                          className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest border transition-all ${newPolicy.targetRole === role ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl' : 'bg-white text-slate-400 border-slate-200'}`}
                        >
                          {role}S ONLY
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Categories & Quotas</label>
                  {newPolicyTypes.map((type, idx) => (
                    <div key={idx} className="flex gap-4">
                      <input required value={type.name} onChange={e => handleUpdateTypeRow(idx, 'name', e.target.value)} className="flex-1 px-6 py-4 rounded-2xl border border-slate-100 font-black" placeholder="Type (e.g. Annual)" />
                      <input required type="number" value={type.days} onChange={e => handleUpdateTypeRow(idx, 'days', parseInt(e.target.value))} className="w-32 px-6 py-4 rounded-2xl border border-slate-100 font-black text-center" />
                      <button type="button" onClick={() => handleRemoveTypeRow(idx)} className="p-4 text-rose-500"><X size={20} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => handleUpdateTypeRow(newPolicyTypes.length, 'name', '')} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                    <ListPlus size={16} /> Add Category
                  </button>
                </div>
                <div className="flex gap-4">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest">Commit Policy</button>
                  <button type="button" onClick={() => setShowAddPolicy(false)} className="px-10 bg-white border border-slate-200 text-slate-600 py-5 rounded-2xl font-black text-xs uppercase tracking-widest">Cancel</button>
                </div>
              </form>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {policies.map(p => (
                <div key={p.id} className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 group hover:bg-white hover:shadow-xl transition-all relative">
                  <div className="absolute top-8 right-8 flex items-center gap-3">
                    <span className="text-[8px] font-black px-3 py-1 bg-white border border-slate-100 rounded-full text-indigo-500 uppercase tracking-widest">{p.targetRole}S</span>
                    <button onClick={async () => { if (confirm('Delete policy?')) { await db.delete('leave_policies', p.id); refreshData(); } }} className="text-slate-200 hover:text-rose-500"><Trash2 size={20} /></button>
                  </div>
                  <div className="mb-6">
                    <p className="font-black text-slate-900 text-xl tracking-tight mb-1">{p.name}</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Absence Governance Unit</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.types.map(t => (
                      <span key={t.id} className="text-[10px] font-black bg-white border border-slate-100 px-3 py-1.5 rounded-xl text-slate-500 uppercase tracking-widest">{t.name}: {t.maxDays}D</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- CONFIG TAB --- */}
        {activeTab === 'settings' && user.role === UserRole.BOSS && (
          <form onSubmit={handleUpdateConfig} className="space-y-12 animate-in fade-in">
            <h3 className="font-black text-slate-900 text-2xl tracking-tight">Global Operational Configuration</h3>
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Official Clock-In (Late Threshold)</label>
                <div className="relative group">
                   <Clock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={20} />
                   <input required type="time" value={systemConfig.officialClockInTime} onChange={e => setSystemConfig({...systemConfig, officialClockInTime: e.target.value})} className="w-full pl-16 pr-6 py-5 rounded-2xl bg-slate-50 border border-slate-100 font-black outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                </div>
              </div>
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Official Clock-Out</label>
                <div className="relative group">
                   <Clock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={20} />
                   <input required type="time" value={systemConfig.officialClockOutTime} onChange={e => setSystemConfig({...systemConfig, officialClockOutTime: e.target.value})} className="w-full pl-16 pr-6 py-5 rounded-2xl bg-slate-50 border border-slate-100 font-black outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                </div>
              </div>
              <div className="md:col-span-2 space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Organization Title</label>
                <input required value={systemConfig.companyName} onChange={e => setSystemConfig({...systemConfig, companyName: e.target.value})} className="w-full px-8 py-5 rounded-2xl bg-slate-50 border border-slate-100 font-black outline-none focus:border-indigo-500 focus:bg-white transition-all" />
              </div>
            </div>
            <button type="submit" disabled={isProcessing} className="bg-indigo-600 text-white px-12 py-6 rounded-3xl font-black text-sm shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-[0.2em] flex items-center justify-center gap-4">
              {isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Settings size={20} />}
              Synchronize Configuration
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ManagementView;