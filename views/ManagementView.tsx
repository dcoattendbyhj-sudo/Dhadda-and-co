import React, { useState, useEffect, useMemo } from 'react';
import { Users, MapPin, Plus, Trash2, Clock, Briefcase, DollarSign, Settings, CheckCircle2, ListPlus, X, Calendar, AlertCircle } from 'lucide-react';
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

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ id: '', name: '', role: UserRole.EMPLOYEE, password: '', managerId: '' });

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', latitude: 0, longitude: 0, radius: 100 });
  const [isLocating, setIsLocating] = useState(false);

  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState('');
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
        setManagedUsers(allUsers.filter(u => u.managerId === user.id));
        setAttendanceRecords(allAtt.filter(r => {
          const staff = allUsers.find(su => su.id === r.userId);
          return staff?.managerId === user.id;
        }));
        setPolicies(allPolicies.filter(p => p.createdBy === user.id));
      }

      setLocations(allLocs);
    } catch (err: any) {
      console.error('Data refresh failed', err);
      setError(`Sync Failure: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyName.trim()) return setError("Policy name required.");
    if (newPolicyTypes.some(t => !t.name.trim() || t.days <= 0)) {
      return setError("All categories must have a name and valid allowance.");
    }

    setIsProcessing(true);
    setError(null);
    try {
      const policyTypes: LeaveType[] = newPolicyTypes.map(item => ({
        id: `type_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: item.name.trim(),
        maxDays: item.days
      }));

      const created: LeavePolicy = {
        id: `pol_${Date.now()}`,
        name: newPolicyName.trim(),
        types: policyTypes,
        createdBy: user.id
      };

      await db.upsert('leave_policies', created);
      setNewPolicyName('');
      setNewPolicyTypes([{ name: 'Annual Leave', days: 20 }, { name: 'Sick Leave', days: 12 }]);
      setShowAddPolicy(false);
      setSuccess('Personnel absence policy established with quotas.');
      refreshData();
    } catch (err: any) {
      setError(`Policy Fault: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddTypeRow = () => setNewPolicyTypes([...newPolicyTypes, { name: '', days: 1 }]);
  const handleRemoveTypeRow = (index: number) => setNewPolicyTypes(newPolicyTypes.filter((_, i) => i !== index));
  const handleUpdateTypeRow = (index: number, field: 'name' | 'days', value: string | number) => {
    const updated = [...newPolicyTypes];
    updated[index] = { ...updated[index], [field]: value };
    setNewPolicyTypes(updated);
  };

  const managers = useMemo(() => managedUsers.filter(u => u.role === UserRole.MANAGER), [managedUsers]);

  const payrollStats = useMemo(() => {
    return managedUsers.map(u => {
      const userAtt = attendanceRecords.filter(r => r.userId === u.id);
      const totalDays = userAtt.length;
      const lateCount = userAtt.filter(r => r.isLate).length;
      const totalHours = userAtt.reduce((acc, r) => {
        if (r.clockIn && r.clockOut) {
          return acc + (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / (1000 * 60 * 60);
        }
        return acc;
      }, 0);
      return { ...u, totalDays, totalHours, lateCount };
    });
  }, [managedUsers, attendanceRecords]);

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);
    try {
      await supabase.from('system_config').update({ config: systemConfig }).eq('id', 'global');
      setSuccess('Operational parameters synchronized with cloud.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`Config Error: ${err.message}`);
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
    } catch (err) {
      alert('Satellite Positioning Fault.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);
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
      setSuccess('Work zone successfully authorized.');
      refreshData();
    } catch (err: any) {
      setError(`Zone Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);
    try {
      if (!newUser.id || !newUser.name || !newUser.password) throw new Error("All identification fields are mandatory.");
      let finalManagerId = user.role === UserRole.MANAGER ? user.id : newUser.managerId;
      const created: User = {
        id: newUser.id.trim(),
        name: newUser.name.trim(),
        role: newUser.role,
        password: newUser.password,
        managerId: newUser.role === UserRole.EMPLOYEE ? (finalManagerId || null as any) : null as any,
        createdAt: Date.now()
      };
      await db.upsert('users', created);
      setNewUser({ id: '', name: '', role: UserRole.EMPLOYEE, password: '', managerId: '' });
      setShowAddUser(false);
      setSuccess(`${newUser.role} identity provisioned successfully.`);
      refreshData();
    } catch (err: any) {
      setError(`Identity Fault: ${err.message}`);
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
            <span className="text-xs font-black uppercase tracking-widest">{success}</span>
          </div>
        )}
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-[1.5rem] w-full md:w-max overflow-x-auto no-scrollbar gap-2">
        {[
          { id: 'users', label: 'Identity', icon: Users, roles: [UserRole.BOSS, UserRole.MANAGER] },
          { id: 'payroll', label: 'Payroll Audit', icon: DollarSign, roles: [UserRole.BOSS, UserRole.MANAGER] },
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

      <div className="bg-white rounded-[3rem] p-12 shadow-2xl shadow-slate-200 border border-white">
        {error && (
          <div className="mb-8 bg-rose-50 border border-rose-100 text-rose-600 p-6 rounded-2xl flex items-center gap-4 animate-in shake duration-500">
            <AlertCircle size={24} />
            <p className="text-sm font-black uppercase tracking-tight">{error}</p>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Staff Directory</h3>
              <button 
                onClick={() => { setShowAddUser(true); setError(null); }} 
                className="bg-indigo-600 text-white p-4 rounded-3xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center gap-2"
              >
                <Plus size={28} />
                <span className="md:inline hidden text-xs font-black uppercase tracking-widest mr-2">Provision User</span>
              </button>
            </div>

            {showAddUser && (
              <form onSubmit={handleAddUser} className="bg-slate-50 p-10 rounded-[2.5rem] space-y-8 border border-slate-100 animate-in slide-in-from-top-4 duration-500">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Corporate ID (Unique)</label>
                    <input required value={newUser.id} onChange={e => setNewUser({...newUser, id: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none" placeholder="EMP-001" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Legal Name</label>
                    <input required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none" placeholder="Staff Name" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Authorization Role</label>
                    <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black bg-white outline-none">
                      <option value={UserRole.EMPLOYEE}>Standard Employee</option>
                      {user.role === UserRole.BOSS && <option value={UserRole.MANAGER}>Unit Manager</option>}
                    </select>
                  </div>
                  {user.role === UserRole.BOSS && newUser.role === UserRole.EMPLOYEE && (
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Reporting Manager</label>
                      <select required value={newUser.managerId} onChange={e => setNewUser({...newUser, managerId: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black bg-white outline-none">
                        <option value="">Select Reporting Line</option>
                        <option value={user.id}>Direct to Boss (Me)</option>
                        {managers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Access Token (Password)</label>
                    <input required type="text" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black outline-none" placeholder="Default Password" />
                  </div>
                </div>
                <div className="flex gap-4 pt-4 border-t border-slate-200/50">
                  <button type="submit" disabled={isProcessing} className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">COMMIT IDENTITY</button>
                  <button type="button" onClick={() => setShowAddUser(false)} className="px-10 bg-white border border-slate-200 text-slate-600 py-5 rounded-2xl font-black hover:bg-slate-50">CANCEL</button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-slate-50 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
                    <th className="pb-6">Staff Member</th>
                    <th className="pb-6">Designation</th>
                    <th className="pb-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {managedUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="py-6">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black text-slate-400 text-sm shadow-sm group-hover:text-indigo-600 transition-colors">{u.name.charAt(0)}</div>
                          <div>
                            <p className="font-black text-slate-900 tracking-tight text-lg">{u.name}</p>
                            <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">{u.id} {u.managerId && `• Unit: ${u.managerId}`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-6"><span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${u.role === UserRole.MANAGER ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{u.role}</span></td>
                      <td className="py-6 text-right"><button onClick={async () => { if (confirm('Terminate identity?')) { await db.delete('users', u.id); refreshData(); } }} className="text-slate-200 hover:text-red-500 p-3 transition-colors"><Trash2 size={20} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'policies' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Leave Policy Frameworks</h3>
              <button onClick={() => setShowAddPolicy(true)} className="bg-indigo-600 text-white p-4 rounded-3xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center gap-2">
                <Plus size={28} />
                <span className="md:inline hidden text-xs font-black uppercase tracking-widest mr-2">New Policy</span>
              </button>
            </div>

            {showAddPolicy && (
              <form onSubmit={handleAddPolicy} className="bg-slate-50 p-10 rounded-[2.5rem] space-y-8 border border-slate-100 animate-in slide-in-from-top-4 duration-500">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Policy Framework Name</label>
                  <input required value={newPolicyName} onChange={e => setNewPolicyName(e.target.value)} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none" placeholder="Corporate Operations 2025" />
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Absence Categories & Annual Quotas</label>
                  </div>
                  {newPolicyTypes.map((type, idx) => (
                    <div key={idx} className="flex gap-4 items-center animate-in slide-in-from-left-2 transition-all">
                      <div className="flex-1 relative">
                        <input required value={type.name} onChange={e => handleUpdateTypeRow(idx, 'name', e.target.value)} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none" placeholder="Category Name (e.g. Annual)" />
                      </div>
                      <div className="w-32 relative">
                        <input required type="number" min="1" value={type.days} onChange={e => handleUpdateTypeRow(idx, 'days', parseInt(e.target.value))} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none text-center" />
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-black text-slate-300 uppercase">Days</span>
                      </div>
                      {newPolicyTypes.length > 1 && (
                        <button type="button" onClick={() => handleRemoveTypeRow(idx)} className="p-4 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-colors">
                          <X size={20} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={handleAddTypeRow} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 px-4 py-2 hover:bg-indigo-50 rounded-xl transition-all">
                    <ListPlus size={16} /> Add Additional Category
                  </button>
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-200/50">
                  <button type="submit" disabled={isProcessing} className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 flex items-center justify-center gap-3">
                    {isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : "AUTHORIZE POLICY FRAMEWORK"}
                  </button>
                  <button type="button" onClick={() => setShowAddPolicy(false)} className="px-10 bg-white border border-slate-200 text-slate-600 py-5 rounded-2xl font-black">CANCEL</button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {policies.map(policy => (
                <div key={policy.id} className="p-8 bg-slate-50 border border-slate-100 rounded-[2rem] flex justify-between items-start group hover:bg-white hover:shadow-xl transition-all">
                  <div className="flex-1">
                    <p className="font-black text-slate-900 text-xl tracking-tight mb-4">{policy.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {policy.types.map(t => (
                        <span key={t.id} className="text-[9px] font-black bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <Calendar size={10} className="text-indigo-400" />
                          {t.name} <span className="text-indigo-600 font-black">• {t.maxDays}D</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={async () => { if (confirm('Deactivate policy?')) { await db.delete('leave_policies', policy.id); refreshData(); } }} className="text-slate-200 hover:text-red-500 p-3 transition-colors">
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
              {policies.length === 0 && !showAddPolicy && (
                <div className="md:col-span-2 py-20 text-center">
                  <Briefcase size={48} className="mx-auto text-slate-100 mb-4" />
                  <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No localized policies established yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ... Other tabs ... */}
      </div>
    </div>
  );
};

export default ManagementView;