
import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Notification } from '../types';
import { supabase } from '../services/db';

interface NotificationCenterProps {
  notifications: Notification[];
  userId: string;
  onRefresh: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, userId, onRefresh }) => {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async () => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipientId', userId);
    if (!error) onRefresh();
  };

  return (
    <div className="relative">
      <button 
        className="relative p-1 text-slate-300 hover:text-white"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) markAsRead();
        }}
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-96 overflow-y-auto overflow-x-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Notifications</h3>
            </div>
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-sm">No new notifications</p>
              </div>
            ) : (
              notifications.sort((a,b) => b.timestamp - a.timestamp).map(n => (
                <div key={n.id} className={`p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-indigo-50/50' : ''}`}>
                  <p className="text-sm text-slate-800 leading-tight mb-1">{n.message}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{new Date(n.timestamp).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationCenter;
