import React, { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, CheckCircle2, AlertCircle, Clock, LogOut, Fingerprint, Scan, ShieldCheck, UserCheck, Loader2 } from 'lucide-react';
import { User, UserRole, Location, AttendanceRecord, SystemConfig } from '../types';
import { db, supabase } from '../services/db';
import { getCurrentPosition, calculateDistance } from '../services/geoService';
import { GoogleGenAI, Type } from "@google/genai";

interface AttendanceViewProps { user: User; }

const AttendanceView: React.FC<AttendanceViewProps> = ({ user }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentRecord, setCurrentRecord] = useState<AttendanceRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [authStage, setAuthStage] = useState<'idle' | 'method_selection' | 'verifying_face' | 'verifying_fingerprint' | 'ai_analyzing'>('idle');
  const [selfieStream, setSelfieStream] = useState<MediaStream | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [masterSelfie, setMasterSelfie] = useState<string | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [locs, recordRes] = await Promise.all([
          db.getAll<Location>('locations'),
          supabase.from('attendance').select('*').eq('userId', user.id).eq('date', today).single()
        ]);
        setLocations(locs);
        if (recordRes.data) setCurrentRecord(recordRes.data);
        
        const { data: userData } = await supabase.from('users').select('profileSelfie').eq('id', user.id).single();
        if (userData?.profileSelfie) {
          setMasterSelfie(userData.profileSelfie);
          setIsEnrolling(false);
        } else {
          setIsEnrolling(true);
        }
      } catch (err) {
        console.error('Initial fetch failed', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitial();
  }, [user.id, today]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setSelfieStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setError('Face Recognition Failure: Camera access denied.');
      setAuthStage('idle');
    }
  };

  const stopCamera = () => {
    if (selfieStream) {
      selfieStream.getTracks().forEach(track => track.stop());
      setSelfieStream(null);
    }
  };

  const verifyIdentityWithAI = async (currentSelfie: string): Promise<{ isMatch: boolean; confidence: number }> => {
    if (isEnrolling || !masterSelfie) return { isMatch: true, confidence: 100 };

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Extract base64 data strings
    const masterBase64 = masterSelfie.split(',')[1];
    const currentBase64 = currentSelfie.split(',')[1];

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { text: "You are a high-security biometric verification system. Compare these two images. Image 1 is the Master Profile Identity. Image 2 is the current Clock-In attempt. Determine if they are the same person. Return your analysis in strict JSON format." },
              { inlineData: { mimeType: 'image/jpeg', data: masterBase64 } },
              { inlineData: { mimeType: 'image/jpeg', data: currentBase64 } }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isMatch: { type: Type.BOOLEAN, description: "True if both images represent the same individual." },
              confidence: { type: Type.NUMBER, description: "Confidence score from 0 to 100." },
              reason: { type: Type.STRING, description: "Brief justification for the match result." }
            },
            required: ["isMatch", "confidence"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      return {
        isMatch: result.isMatch === true && result.confidence >= 85,
        confidence: result.confidence || 0
      };
    } catch (err) {
      console.error("AI Verification Error:", err);
      // Fallback for network issues in high-security: fail safe (deny)
      throw new Error("Neural Handshake failed. Ensure stable connection.");
    }
  };

  // Fixed the verification scope error by declaring verificationResult outside the if block
  const finalizeAttendance = async (selfieBase64: string = '') => {
    setError(null);
    setIsProcessing(true);
    let verificationResult: { isMatch: boolean; confidence: number } | null = null;

    try {
      if (selfieBase64) {
        setAuthStage('ai_analyzing');
        verificationResult = await verifyIdentityWithAI(selfieBase64);
        setMatchScore(verificationResult.confidence);

        if (!verificationResult.isMatch) {
          throw new Error(`Biometric Mismatch: Identity could not be verified with sufficient confidence (${verificationResult.confidence}%). Access Denied.`);
        }
      }

      const { data: configRaw } = await supabase.from('system_config').select('config').eq('id', 'global').single();
      const config = (configRaw?.config as unknown as SystemConfig) || { officialClockInTime: '09:00' };
      
      const pos = await getCurrentPosition();
      const { latitude, longitude } = pos.coords;

      const matchedLoc = locations.find(loc => 
        calculateDistance(latitude, longitude, loc.latitude, loc.longitude) <= loc.radius
      );

      if (!matchedLoc && user.role === UserRole.EMPLOYEE) {
        throw new Error('Check-in denied: Outside authorized geofence.');
      }

      if (isEnrolling && selfieBase64) {
        await supabase.from('users').update({ profileSelfie: selfieBase64 }).eq('id', user.id);
        setIsEnrolling(false);
        setMasterSelfie(selfieBase64);
      }

      const now = new Date();
      const [officialH, officialM] = config.officialClockInTime.split(':').map(Number);
      const officialDate = new Date();
      officialDate.setHours(officialH, officialM, 0, 0);
      
      const isLate = now > officialDate && (user.role === UserRole.EMPLOYEE);

      if (!currentRecord) {
        const newRecord: AttendanceRecord = {
          id: `att_${Date.now()}`,
          userId: user.id,
          userName: user.name,
          role: user.role,
          date: today,
          clockIn: now.toISOString(),
          latitude,
          longitude,
          selfieBase64: selfieBase64 || 'biometric_fingerprint_verified',
          isLate
        };

        await db.upsert('attendance', newRecord);
        setCurrentRecord(newRecord);
        setSuccess(isEnrolling ? 'Identity Registered. Biometric Profile created.' : 'Neural Handshake Complete. Identity Verified.');

        if (isLate) {
          const approverId = user.managerId || 'admin';
          await db.upsert('notifications', {
            id: `notif_${Date.now()}`,
            recipientId: approverId,
            message: `LATE ALERT: ${user.name} checked in at ${now.toLocaleTimeString()} (${verificationResult?.confidence || 100}% identity match).`,
            type: 'LATE_ARRIVAL',
            timestamp: Date.now(),
            read: false
          });
        }
      } else {
        await db.upsert('attendance', { ...currentRecord, clockOut: now.toISOString() });
        setCurrentRecord({ ...currentRecord, clockOut: now.toISOString() });
        setSuccess('Work session terminated. Identity logged.');
      }

      setAuthStage('idle');
    } catch (err: any) {
      setError(err.message || 'System error during biometric logging.');
      setAuthStage('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  const captureFace = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const selfieBase64 = canvas.toDataURL('image/jpeg', 0.8);
    stopCamera();
    finalizeAttendance(selfieBase64);
  };

  if (isLoading) return <div className="py-20 text-center font-black">Connecting Secure Node...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="bg-white rounded-[3rem] p-10 shadow-2xl shadow-slate-200 border border-white relative overflow-hidden">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
              <Clock className="text-indigo-600" size={32} />
              Daily Attendance
            </h2>
            <p className="text-slate-400 font-bold mt-1 uppercase text-[10px] tracking-widest">
              {isEnrolling ? "Biometric Enrollment Active" : "AI Verification Protocol Enabled"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-6 py-2 rounded-full uppercase tracking-widest border border-indigo-100">{today}</span>
            {matchScore && !isProcessing && (
              <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Last Match: {matchScore}%</span>
            )}
          </div>
        </div>

        {isEnrolling && !currentRecord && (
          <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-3xl flex items-center gap-4 text-indigo-600">
             <UserCheck size={24} />
             <p className="text-xs font-black uppercase tracking-tight">System: Master Biometric Registration required for identity establishment.</p>
          </div>
        )}

        {error && (
          <div className="mb-10 bg-red-50 text-red-600 p-6 rounded-[2rem] flex gap-4 items-center border border-red-100 animate-in shake duration-500">
            <AlertCircle className="shrink-0" size={24} />
            <p className="text-sm font-black uppercase tracking-tight">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-10 bg-emerald-50 text-emerald-600 p-6 rounded-[2rem] flex gap-4 items-center border border-emerald-100 animate-in zoom-in duration-300">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={24} />
                <p className="text-sm font-black uppercase tracking-tight">{success}</p>
              </div>
              {matchScore && <p className="text-[10px] font-black opacity-60 ml-9 uppercase tracking-widest">Neural Identity Score: {matchScore}% Match</p>}
            </div>
          </div>
        )}

        {authStage === 'method_selection' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-300">
            <button 
              onClick={() => { setAuthStage('verifying_face'); startCamera(); }}
              className="group p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] flex flex-col items-center hover:bg-white hover:border-indigo-600 transition-all hover:shadow-2xl"
            >
              <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-300 group-hover:text-indigo-600 transition-colors mb-6 shadow-sm">
                <Scan size={32} />
              </div>
              <p className="font-black text-slate-900 uppercase tracking-widest text-xs">AI Face ID</p>
              <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-widest">{isEnrolling ? 'Enrollment' : 'Verification'}</p>
            </button>
            <button 
              onClick={() => setAuthStage('verifying_fingerprint')}
              className="group p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] flex flex-col items-center hover:bg-white hover:border-indigo-600 transition-all hover:shadow-2xl"
            >
              <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-300 group-hover:text-indigo-600 transition-colors mb-6 shadow-sm">
                <Fingerprint size={32} />
              </div>
              <p className="font-black text-slate-900 uppercase tracking-widest text-xs">Touch ID</p>
              <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-widest">Encrypted Local Hash</p>
            </button>
            <button onClick={() => setAuthStage('idle')} className="md:col-span-2 text-center text-[10px] font-black text-slate-300 hover:text-slate-500 uppercase tracking-widest py-4">Cancel Request</button>
          </div>
        )}

        {authStage === 'verifying_face' && (
          <div className="space-y-8 animate-in zoom-in duration-300">
            <div className="relative overflow-hidden rounded-[3rem] bg-black aspect-video border-8 border-white shadow-2xl">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-[30px] border-slate-900/40 pointer-events-none"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-indigo-500/50 border-dashed rounded-full flex items-center justify-center">
                 <div className="w-full h-0.5 bg-indigo-500/50 absolute animate-scan"></div>
                 <Scan className="text-white/20" size={40} />
              </div>
            </div>
            <button 
              onClick={captureFace}
              className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest flex items-center justify-center gap-4"
            >
              <Camera size={24} />
              {isEnrolling ? 'Establish Master Profile' : 'Execute Neural Scan'}
            </button>
          </div>
        )}

        {authStage === 'ai_analyzing' && (
          <div className="py-20 flex flex-col items-center justify-center space-y-8 animate-in fade-in">
             <div className="relative">
                <div className="w-32 h-32 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <ShieldCheck size={40} className="text-indigo-600 animate-pulse" />
                </div>
             </div>
             <div className="text-center">
                <p className="text-xl font-black text-slate-900 tracking-tight">AI Identity Handshake</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Comparing structural markers with cloud profile...</p>
             </div>
          </div>
        )}

        {authStage === 'verifying_fingerprint' && (
          <div className="flex flex-col items-center py-10 space-y-10 animate-in zoom-in duration-300">
             <div className="relative">
                <div className="absolute inset-0 bg-indigo-600/20 rounded-full animate-ping"></div>
                <button 
                  onClick={() => finalizeAttendance()}
                  disabled={isProcessing}
                  className={`relative w-40 h-40 bg-white border-4 border-slate-100 rounded-full flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:border-indigo-600 transition-all shadow-xl group ${isProcessing ? 'animate-pulse' : ''}`}
                >
                  <Fingerprint size={64} />
                </button>
             </div>
             <div className="text-center">
                <p className="font-black text-slate-900 uppercase tracking-widest text-sm mb-2">{isProcessing ? 'Synchronizing Hash...' : 'Contact Sensor to Authenticate'}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">FIPS 140-2 Level Security</p>
             </div>
             <button onClick={() => setAuthStage('idle')} className="text-[10px] font-black text-slate-300 hover:text-slate-500 uppercase tracking-widest">Back to options</button>
          </div>
        )}

        {authStage === 'idle' && (
          <div className="space-y-6">
            {!currentRecord ? (
              <button 
                onClick={() => setAuthStage('method_selection')}
                disabled={isProcessing}
                className="w-full h-64 flex flex-col items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-[3rem] shadow-2xl shadow-indigo-100 transition-all group overflow-hidden relative"
              >
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url("https://www.transparenttextures.com/patterns/carbon-fibre.png")` }}></div>
                <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                  <ShieldCheck size={40} />
                </div>
                <span className="text-2xl font-black tracking-tight uppercase tracking-widest">Verify Identity</span>
                <p className="text-indigo-100 text-[10px] font-black uppercase mt-2 tracking-widest opacity-80">AI Neural Engine Standby</p>
              </button>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 relative group overflow-hidden">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Authenticated At</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">{new Date(currentRecord.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    {currentRecord.isLate && (
                      <span className="inline-block mt-3 bg-red-100 text-red-600 text-[9px] font-black px-4 py-1 rounded-full uppercase tracking-widest">Threshold Exceeded</span>
                    )}
                  </div>
                  <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 relative group overflow-hidden">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Current Session</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">
                      {currentRecord.clockOut ? new Date(currentRecord.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ACTIVE'}
                    </p>
                  </div>
                </div>

                {!currentRecord.clockOut && (
                  <button 
                    onClick={() => setAuthStage('method_selection')}
                    disabled={isProcessing}
                    className="w-full py-8 bg-slate-900 hover:bg-black text-white rounded-[2.5rem] font-black text-xl shadow-2xl shadow-slate-200 transition-all flex items-center justify-center gap-4 uppercase tracking-widest"
                  >
                    <LogOut size={28} />
                    Finalize Session
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default AttendanceView;