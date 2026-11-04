import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth, type Role } from '../context/AuthContext';
import { CreditCard, Eye, EyeOff, User, GraduationCap, Briefcase } from 'lucide-react';

const ROLES: { id: Role; label: string; icon: typeof User; hintId: string; hintSecret: string; desc: string }[] = [
  { id: 'parent',   label: 'Parent',   icon: User,          hintId: '9876543210',            hintSecret: '123456',      desc: 'Mobile & OTP' },
  { id: 'student',  label: 'Student',  icon: GraduationCap, hintId: 'STU-0412',              hintSecret: 'Student@123', desc: 'Student ID & Password' },
  { id: 'accounts', label: 'Accounts', icon: Briefcase,     hintId: 'accounts@feeflow.demo', hintSecret: 'Demo@12345',  desc: 'Staff Email & Password' },
];

const REDIRECTS: Record<Role, string> = {
  parent: '/parent/dashboard',
  student: '/student/dashboard',
  accounts: '/accounts/dashboard',
};

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('accounts');
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect directly to dashboard
  if (user) {
    return <Navigate to={REDIRECTS[user.role]} replace />;
  }

  const active = ROLES.find(r => r.id === role)!;
  const idLabel = role === 'parent' ? 'Mobile Number' : role === 'student' ? 'Student ID / Mobile' : 'Email / Employee ID';
  const secretLabel = role === 'parent' ? 'OTP' : 'Password';

  const fillDemo = (demoRole: Role) => {
    const item = ROLES.find(r => r.id === demoRole)!;
    setRole(demoRole);
    setId(item.hintId);
    setSecret(item.hintSecret);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !secret.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const err = await login(role, id.trim(), secret);
      setLoading(false);
      if (err) {
        setError(err);
        return;
      }
      navigate(REDIRECTS[role], { replace: true });
    } catch (e: any) {
      setLoading(false);
      setError(e.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">FeeFlow</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 text-center">Welcome back</h1>
          <p className="text-xs text-slate-500 text-center mt-0.5 mb-5">Select your role to access your portal</p>

          {/* Role tabs */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {ROLES.map(r => {
              const Icon = r.icon;
              const sel = role === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRole(r.id);
                    setError('');
                    setId('');
                    setSecret('');
                  }}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border text-xs font-medium transition-all ${
                    sel
                      ? 'border-indigo-600 bg-indigo-50/70 text-indigo-700 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-semibold">{r.label}</span>
                </button>
              );
            })}
          </div>

          {/* Demo credential badge */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-700">Demo Credentials</span>
              <button
                type="button"
                onClick={() => fillDemo(role)}
                className="text-indigo-600 hover:text-indigo-800 font-medium underline"
              >
                Auto-fill
              </button>
            </div>
            <p className="text-slate-600">
              <span className="text-slate-400 font-normal">{idLabel}: </span>
              <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[11px] font-mono text-slate-800">{active.hintId}</code>
            </p>
            <p className="text-slate-600 mt-0.5">
              <span className="text-slate-400 font-normal">{secretLabel}: </span>
              <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[11px] font-mono text-slate-800">{active.hintSecret}</code>
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">{idLabel}</label>
              <input
                type={role === 'parent' ? 'tel' : 'text'}
                value={id}
                onChange={e => {
                  setId(e.target.value);
                  setError('');
                }}
                placeholder={role === 'parent' ? '9876543210' : role === 'student' ? 'STU-0412' : 'accounts@feeflow.demo'}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1">{secretLabel}</label>
              <div className="relative">
                <input
                  type={role === 'parent' ? 'text' : show ? 'text' : 'password'}
                  value={secret}
                  onChange={e => {
                    setSecret(e.target.value);
                    setError('');
                  }}
                  placeholder={role === 'parent' ? '123456' : '••••••••'}
                  maxLength={role === 'parent' ? 6 : undefined}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
                {role !== 'parent' && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShow(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-600 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-md hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors shadow-xs"
            >
              {loading ? 'Verifying…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-xs text-slate-400 text-center mt-4">
          FeeFlow Demo Platform · Accounts, Parent & Student Access
        </p>
      </div>
    </div>
  );
}
