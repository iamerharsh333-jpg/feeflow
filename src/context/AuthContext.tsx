import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../utils/api';

export type Role = 'parent' | 'student' | 'accounts';

export interface AuthUser {
  role: Role;
  name: string;
  id: string;
  centreId?: number;
  centreName?: string;
  isOfflineDemo?: boolean;
}

interface AuthCtx {
  user: AuthUser | null;
  login: (role: Role, id: string, secret: string) => Promise<string | null>;
  logout: () => void;
}

const CREDS: Record<Role, { primaryId: string; aliases: string[]; secret: string; name: string; studentId?: string }[]> = {
  parent: [
    { primaryId: '9876543210', aliases: ['9876543210'], secret: '123456', name: 'Rajesh Meena (Parent)', studentId: 'STU-0412' },
    { primaryId: '9123456789', aliases: ['9123456789'], secret: '654321', name: 'Sunita Sharma (Parent)', studentId: 'STU-0587' },
    { primaryId: '9988776655', aliases: ['9988776655'], secret: '111222', name: 'Ramesh Gurjar (Parent)', studentId: 'STU-0219' },
  ],
  student: [
    { primaryId: 'STU-0412', aliases: ['stu-0412', '9876543210'], secret: 'Student@123', name: 'Aarav Meena' },
    { primaryId: 'STU-0587', aliases: ['stu-0587', '9123456789'], secret: 'Student@123', name: 'Ishita Sharma' },
    { primaryId: 'STU-0219', aliases: ['stu-0219', '9988776655'], secret: 'Student@123', name: 'Mohit Gurjar' },
  ],
  accounts: [
    { primaryId: 'accounts@feeflow.demo', aliases: ['accounts@feeflow.demo', 'emp-001', 'accounts'], secret: 'Demo@12345', name: 'Accounts Executive' },
  ],
};

const KEY = 'feeflow_auth';
const TOKEN_KEY = 'feeflow_token';
const Ctx = createContext<AuthCtx>({ user: null, login: async () => 'err', logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const r = localStorage.getItem(KEY);
      return r ? JSON.parse(r) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [user]);

  const login = useCallback(async (role: Role, id: string, secret: string): Promise<string | null> => {
    let trimmedId = id.trim();
    if (role === 'parent') {
      trimmedId = trimmedId.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '') || trimmedId;
    }
    const trimmedSecret = secret.trim();

    // 1. Attempt backend API authentication
    try {
      let resp: any;
      if (role === 'parent') {
        resp = await api.verifyOtp(trimmedId, trimmedSecret);
      } else {
        resp = await api.login(trimmedId, trimmedSecret);
      }

      if (resp && resp.access_token) {
        localStorage.setItem(TOKEN_KEY, resp.access_token);
        const mappedRole: Role = resp.role === 'accounts_executive' ? 'accounts' : (resp.role as Role);
        const authUser: AuthUser = {
          role: mappedRole,
          name: resp.name,
          id: resp.identifier || resp.student_id || trimmedId,
          centreId: resp.centre_id,
          centreName: resp.centre_name,
          isOfflineDemo: false,
        };
        setUser(authUser);
        if (resp.student_id) {
          localStorage.setItem('parent_student_id', resp.student_id);
        }
        return null; // success
      }
    } catch (err: any) {
      // If server returned an explicit auth error (e.g. 401/400), don't fallback silently to wrong password
      if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        return err.message;
      }
      // If backend server is completely offline / unreachable, fallback to explicitly labelled client demo logic
    }

    // 2. Client-side fallback for offline demo testing
    const match = CREDS[role].find(c =>
      c.aliases.includes(trimmedId.toLowerCase()) &&
      (c.secret === trimmedSecret || (role === 'parent' && trimmedSecret === '123456'))
    );
    if (!match) {
      return role === 'parent' ? 'Invalid mobile number or OTP' : 'Invalid credentials';
    }
    setUser({ role, name: match.name, id: match.primaryId, centreId: 1, centreName: 'Jaipur Main', isOfflineDemo: true });
    if (role === 'parent') {
      localStorage.setItem('parent_student_id', match.studentId || 'STU-0412');
    }
    return null;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('parent_student_id');
  }, []);

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function RequireAuth({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
