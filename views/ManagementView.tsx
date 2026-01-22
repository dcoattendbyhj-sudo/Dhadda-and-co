import React, { useState, useEffect, useMemo } from 'react';
import { Users, MapPin, Plus, Trash2, Clock, Briefcase, DollarSign, Settings, CheckCircle2, ListPlus, X, Calendar, AlertCircle, Search, Download } from 'lucide-react';
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
    setIsProcessing(true);
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
      setShowAddPolicy(false);
      setSuccess('Personnel absence policy established.');
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
      setSuccess("Satellite coordinates acquired.");
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError('Satellite Positioning Fault. Ensure GPS is enabled.');
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
        managerId: newUser.role === UserRole.EMPLOYEE ? (finalManagerId || undefined) : undefined,
        createdAt: Date.now()
      };
      await db.upsert('users', created);
      setShowAddUser(false);
      setSuccess(`${newUser.role} identity provisioned.`);
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

      <div className="bg-white rounded-[3rem] p-12 shadow-2xl shadow-slate-200 border border-white">
        {error && (
          <div className="mb-8 bg-rose-50 border border-rose-100 text-rose-600 p-6 rounded-2xl flex items-center gap-4 animate-in shake duration-500">
            <AlertCircle size={24} />
            <p className="text-sm font-black uppercase tracking-tight">{error}</p>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Staff Directory</h3>
              <button 
                onClick={() => setShowAddUser(true)} 
                className="bg-indigo-600 text-white p-4 rounded-3xl hover:bg-indigo-700 shadow-xl transition-all flex items-center gap-2"
              >
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

        {activeTab === 'locations' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Geofence Registry</h3>
              <button 
                onClick={() => { setShowAddLocation(true); setError(null); }} 
                className="bg-indigo-600 text-white p-4 rounded-3xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center gap-2"
              >
                <Plus size={28} />
                <span className="md:inline hidden text-xs font-black uppercase tracking-widest mr-2">Authorize Site</span>
              </button>
            </div>

            {showAddLocation && (
              <form onSubmit={handleAddLocation} className="bg-slate-50 p-10 rounded-[2.5rem] space-y-8 border border-slate-100 animate-in slide-in-from-top-4 duration-500">
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Site Designation Name</label>
                    <input required value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none" placeholder="Headquarters / Site Alpha" />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Latitude</label>
                    <input required type="number" step="any" value={newLoc.latitude} onChange={e => setNewLoc({...newLoc, latitude: parseFloat(e.target.value)})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none" placeholder="0.000000" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Longitude</label>
                    <input required type="number" step="any" value={newLoc.longitude} onChange={e => setNewLoc({...newLoc, longitude: parseFloat(e.target.value)})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none" placeholder="0.000000" />
                  </div>
                  
                  <div className="md:col-span-2">
                    <button 
                      type="button" 
                      onClick={handleFetchCurrentLocation} 
                      disabled={isLocating}
                      className="w-full py-4 bg-white border-2 border-dashed border-indigo-200 text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-50 transition-all"
                    >
                      {isLocating ? <div className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div> : <MapPin size={16} />}
                      {isLocating ? "Acquiring Satellite Lock..." : "Fetch Current GPS Coordinates"}
                    </button>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Authorized Radius (Meters)</label>
                    <input required type="number" min="10" value={newLoc.radius} onChange={e => setNewLoc({...newLoc, radius: parseInt(e.target.value)})} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700 outline-none" />
                    <p className="text-[9px] text-slate-300 font-bold uppercase mt-2 tracking-widest">Recommended: 100m for standard sites</p>
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-200/50">
                  <button type="submit" disabled={isProcessing} className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 uppercase tracking-widest text-xs">Authorize Site Zone</button>
                  <button type="button" onClick={() => setShowAddLocation(false)} className="px-10 bg-white border border-slate-200 text-slate-600 py-5 rounded-2xl font-black uppercase tracking-widest text-xs">Cancel</button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {locations.map(loc => (
                <div key={loc.id} className="p-8 bg-slate-50 border border-slate-100 rounded-[2rem] flex justify-between items-start group hover:bg-white hover:shadow-xl transition-all">
                  <div>
                    <p className="font-black text-slate-900 text-xl tracking-tight mb-2">{loc.name}</p>
                    <div className="flex flex-col gap-1">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Coordinates: {loc.latitude}, {loc.longitude}</p>
                      <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest">Radius: {loc.radius}m</p>
                    </div>
                  </div>
                  <button onClick={async () => { if (confirm('Decommission site?')) { await db.delete('locations', loc.id); refreshData(); } }} className="text-slate-200 hover:text-rose-500 p-3 transition-colors"><Trash2 size={20} /></button>
                </div>
              ))}
              {locations.length === 0 && !showAddLocation && (
                <div className="md:col-span-2 py-20 text-center">
                  <MapPin size={48} className="mx-auto text-slate-100 mb-4" />
                  <p className="text-slate-400 font-black uppercase text-xs tracking-widest">No site zones registered in registry.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'records' && (
          <div className="space-y-8">
            <h3 className="font-black text-slate-900 text-2xl tracking-tight">System Audit Log</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-slate-50 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
                    <th className="pb-6">Date</th>
                    <th className="pb-6">Staff Member</th>
                    <th className="pb-6">Clock-In</th>
                    <th className="pb-6">Clock-Out</th>
                    <th className="pb-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {attendanceRecords.sort((a,b) => b.clockIn.localeCompare(a.clockIn)).map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors text-sm">
                      <td className="py-4 font-bold text-slate-600">{r.date}</td>
                      <td className="py-4 font-black text-slate-900">{r.userName}</td>
                      <td className="py-4 font-bold">{new Date(r.clockIn).toLocaleTimeString()}</td>
                      <td className="py-4 font-bold">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString() : '--:--'}</td>
                      <td className="py-4">
                        {r.isLate ? 
                          <span className="text-[10px] font-black bg-rose-50 text-rose-500 px-3 py-1 rounded-full uppercase tracking-widest">Anomaly</span> : 
                          <span className="text-[10px] font-black bg-emerald-50 text-emerald-500 px-3 py-1 rounded-full uppercase tracking-widest">Nominal</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="space-y-8">
            <h3 className="font-black text-slate-900 text-2xl tracking-tight">Personnel Payroll Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-slate-50 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
                    <th className="pb-6">Personnel</th>
                    <th className="pb-6">Active Days</th>
                    <th className="pb-6">Total Hours</th>
                    <th className="pb-6">Anomalies</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payrollStats.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-6 font-black text-slate-900">{u.name} <span className="text-slate-300 ml-2">({u.id})</span></td>
                      <td className="py-6 font-black text-indigo-600">{u.totalDays}</td>
                      <td className="py-6 font-bold">{u.totalHours.toFixed(1)}h</td>
                      <td className="py-6 font-black text-rose-500">{u.lateCount}</td>
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
              <h3 className="font-black text-slate-900 text-2xl tracking-tight">Absence Frameworks</h3>
              <button onClick={() => setShowAddPolicy(true)} className="bg-indigo-600 text-white p-4 rounded-3xl hover:bg-indigo-700 shadow-xl transition-all flex items-center gap-2">
                <Plus size={28} />
                <span className="md:inline hidden text-xs font-black uppercase tracking-widest mr-2">New Policy</span>
              </button>
            </div>

            {showAddPolicy && (
              <form onSubmit={handleAddPolicy} className="bg-slate-50 p-10 rounded-[2.5rem] space-y-8 border border-slate-100 animate-in slide-in-from-top-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Policy Name</label>
                  <input required value={newPolicyName} onChange={e => setNewPolicyName(e.target.value)} className="w-full px-6 py-4 rounded-2xl border border-slate-100 font-black text-slate-700" placeholder="Corporate 2025" />
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
                  <button type="button" onClick={handleAddTypeRow} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
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
                <div key={p.id} className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 group hover:bg-white hover:shadow-xl transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <p className="font-black text-slate-900 text-xl tracking-tight">{p.name}</p>
                    <button onClick={async () => { if (confirm('Delete policy?')) { await db.delete('leave_policies', p.id); refreshData(); } }} className="text-slate-200 hover:text-rose-500"><Trash2 size={20} /></button>
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