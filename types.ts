export enum UserRole {
  BOSS = 'BOSS',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE'
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  password?: string;
  managerId?: string; // For Employees/Managers
  createdAt: number;
}

export interface SystemConfig {
  officialClockInTime: string; // HH:mm
  officialClockOutTime: string; // HH:mm
  companyName: string;
}

export interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters
  createdBy: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  role: UserRole;
  date: string; // YYYY-MM-DD
  clockIn: string; // ISO String
  clockOut?: string; // ISO String
  latitude: number;
  longitude: number;
  selfieBase64: string;
  isLate: boolean;
}

export interface LeaveType {
  id: string;
  name: string;
  maxDays: number;
}

export interface LeavePolicy {
  id: string;
  name: string;
  types: LeaveType[];
  createdBy: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  policyId: string;
  policyName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  requestedAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
}

export interface Notification {
  id: string;
  recipientId: string;
  message: string;
  type: 'LATE_ARRIVAL' | 'LEAVE_REQUEST';
  timestamp: number;
  read: boolean;
}