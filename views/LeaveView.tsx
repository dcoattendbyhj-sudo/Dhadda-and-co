import React, { useState, useEffect } from 'react';
import { CalendarDays, Plus, CheckCircle2, Briefcase, FileText, ChevronRight } from 'lucide-react';
import { User, UserRole, LeaveRequest, LeavePolicy, LeaveStatus } from '../types';
import { db, supabase } from '../services/db';

interface LeaveViewProps { user: User; }

const LeaveView: React.FC<LeaveViewProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'approvals'>('requests');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [approvals, setApprovals] = useState<LeaveRequest[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [newRequest, setNewRequest] = useState({
    policyId: '',
    typeId: '',
    startDate: '',
    endDate: '',
    reason: ''
  });

  useEffect(() => {
    refreshData();
  }, [user]);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [allReq, allUsers, allPol] = await Promise.all([
        db.getAll<LeaveRequest>('leave_requests'),
        db.getAll<User>('users'),
        db.getAll<LeavePolicy>('leave_policies')
      ]);

      setRequests(allReq.filter(r => r.userId === user.id));

      const myManagerId = user.managerId;
      const relevantPolicies = allPol.filter(p => 
        p.createdBy === myManagerId || 
        allUsers.find(u => u.id === p.createdBy)?.role === UserRole.BOSS
      );
      setPolicies(relevantPolicies);

      if (user.role === UserRole.BOSS) {
        setApprovals(allReq.filter(r => r.userRole === UserRole.MANAGER && r.status === LeaveStatus.PENDING));
      } else if (user.role === UserRole.MANAGER) {
        setApprovals(allReq.filter(r => {
          const staff = allUsers.find(su => su.id === r.userId);
          return staff?.managerId === user.id && r.status === LeaveStatus.PENDING;
        }));
      }
    } catch (err) {
      console.error('Leave refresh error', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const policy = policies.find(p => p.id === newRequest.policyId);
    const leaveType = policy?.types.find(t => t.id === newRequest.typeId);
    
    if (!policy || !leaveType) return alert('Policy and Type selection mandatory.');

    const req: LeaveRequest = {
      id: `lr_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      policyId: policy.id,
      policyName: `${policy.name} (${leaveType.name})`,
      startDate: newRequest.startDate,
      endDate: newRequest.endDate,
      reason: newRequest.reason,
      status: LeaveStatus.PENDING,
      requestedAt: Date.now()
    };

    await db.upsert('leave_requests', req);
    
    const approverId = user.role === UserRole.EMPLOYEE ? (user.managerId || 'admin') : 'admin';
    await db.upsert('notifications', {
      id: `n_${Date.now()}`,
      recipientId: approverId,
      message: `ABSENCE REQUEST: ${user.name} submitted for ${leaveType.name}.`,
      type: 'LEAVE_REQUEST',
      timestamp: Date.now(),
      read: false
    });

    setShowRequestForm(false);
    setNewRequest({ policyId: '', typeId: '', startDate: '', endDate: '', reason: '' });
    refreshData();
  };

  const processApproval = async (id: string, status: LeaveStatus) => {
    await supabase.from('leave_requests').update({ 
      status, 
      reviewedBy: user.id, 
      reviewedAt: Date.now() 
    }).eq('id', id);
    refreshData();
  };

  const selectedPolicy = policies.find(p => p.id === newRequest.policyId);

  if (loading) return <div className="py-20 text-center font-black">Accessing Absence Ledger...</div>;

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Leave Portal</h1>
          <p className="text-slate-500 font-bold mt-2">Formal absence governance and corporate ledger.</p>
        </div>
        {(user.role !== UserRole.BOSS) && (
          <button onClick={() => setShowRequestForm(true)} className="bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black text-sm shadow-2xl shadow-indigo-100 transition-all hover:bg-indigo-700 uppercase tracking-widest">
            File New Request
          </button>
        )}
      </div>

      <div className="flex bg-slate-200/40 p-1.5 rounded-[1.5rem] w-max">
        <button onClick={() => setActiveTab('requests')} className={`px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'requests' ? 'bg-white text-indigo-600 shadow-xl' : 'text-slate-400'}`}>My History</button>
        {user.role !== UserRole.EMPLOYEE && (
          <button onClick={() => setActiveTab('approvals')} className={`px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-3 transition-all ${activeTab === 'approvals' ? 'bg-white text-indigo-600 shadow-xl' : 'text-slate-400'}`}>
            Review Inbox
            {approvals.length > 0 && <span className="bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-black animate-pulse">{approvals.length}</span>}
          </button>
        )}
      </div>

      <div className="bg-white rounded-[3rem] p-10 shadow-2xl shadow-slate-200 border border-white">
        {showRequestForm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/10 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-xl rounded-[3rem] p-12 shadow-2xl border border-white max-h-[90vh] overflow-y-auto">
              <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tight text-center">Authorization Request</h2>
              <form onSubmit={handleCreateRequest} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Policy Framework</label>
                  <select required value={newRequest.policyId} onChange={e => setNewRequest({...newRequest, policyId: e.target.value, typeId: ''})} className="w-full px-6 py-5 rounded-[1.5rem] bg-slate-50 font-black outline-none border border-slate-100 focus:border-indigo-500 transition-colors">
                    <option value="">Select Governing Policy</option>
                    {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                
                {selectedPolicy && (
                  <div className="animate-in slide-in-from-top-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Leave Category</label>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedPolicy.types.map(t => (
                        <button 
                          key={t.id}
                          type="button"
                          onClick={() => setNewRequest({...newRequest, typeId: t.id})}
                          className={`px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                            newRequest.typeId === t.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50'
                          }`}
                        >
                          {t.name} ({t.maxDays}D)
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Commencement</label>
                    <input required type="date" value={newRequest.startDate} onChange={e => setNewRequest({...newRequest, startDate: e.target.value})} className="w-full px-6 py-5 rounded-[1.5rem] bg-slate-50 font-black outline-none border border-slate-100" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Conclusion</label>
                    <input required type="date" value={newRequest.endDate} onChange={e => setNewRequest({...newRequest, endDate: e.target.value})} className="w-full px-6 py-5 rounded-[1.5rem] bg-slate-50 font-black outline-none border border-slate-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Justification</label>
                  <textarea required rows={3} value={newRequest.reason} onChange={e => setNewRequest({...newRequest, reason: e.target.value})} className="w-full px-6 py-5 rounded-[1.5rem] bg-slate-50 font-bold outline-none border border-slate-100" placeholder="State reason for absence..."></textarea>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="submit" className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase tracking-widest text-xs">Authorize Request</button>
                  <button type="button" onClick={() => setShowRequestForm(false)} className="px-10 bg-slate-100 text-slate-600 py-5 rounded-2xl font-black uppercase tracking-widest text-xs">Abort</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ... Tab Rendering logic ... */}
      </div>
    </div>
  );
};

export default LeaveView;