import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth, type Role } from '../context/AuthContext';
import { Eye, EyeOff, User, GraduationCap, Briefcase } from 'lucide-react';
import { api } from '../utils/api';

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
  const [otpSending, setOtpSending] = useState(false);
  const [otpInfo, setOtpInfo] = useState('');

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
    if (demoRole === 'parent') {
      setOtpInfo('Demo OTP 123456 auto-filled');
    } else {
      setOtpInfo('');
    }
  };

  const handleRequestOtp = async () => {
    const trimmedPhone = id.trim();
    if (!trimmedPhone) {
      setError('Please enter a mobile number first');
      return;
    }
    setOtpSending(true);
    setError('');
    try {
      const res = await api.sendOtp(trimmedPhone);
      const generatedOtp = res.demo_otp || '123456';
      setSecret(generatedOtp);
      setOtpInfo(`✓ Demo OTP ${generatedOtp} generated and auto-filled`);
    } catch (err: any) {
      setSecret('123456');
      setOtpInfo('✓ Demo OTP 123456 ready to sign in');
    } finally {
      setOtpSending(false);
    }
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
    <div className="min-h-screen bg-[#929DB4] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 bg-[#20283A] rounded-2xl flex items-center justify-center shadow-md">
            <span className="w-3 h-3 rounded-full bg-[#E95435]" />
          </div>
          <span className="text-2xl font-bold text-[#20283A] tracking-tight">FeeFlow</span>
        </div>

        <div className="bg-white border border-[#E3E6E9] rounded-3xl p-7 shadow-xl">
          <h1 className="text-lg font-bold text-[#20283A] text-center tracking-tight">Sign In to FeeFlow</h1>
          <p className="text-xs text-[#718096] text-center mt-1 mb-6">Select your portal access level</p>

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
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border text-xs font-semibold transition-all ${
                    sel
                      ? 'border-[#20283A] bg-[#20283A] text-white shadow-xs'
                      : 'border-[#E3E6E9] bg-white text-[#718096] hover:bg-slate-50 hover:text-[#20283A]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{r.label}</span>
                </button>
              );
            })}
          </div>

          {/* Demo credential badge */}
          <div className="bg-slate-50/75 border border-[#E3E6E9] rounded-2xl p-3.5 mb-4 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-[#20283A]">Demo Credentials</span>
              <button
                type="button"
                onClick={() => fillDemo(role)}
                className="text-[#E95435] hover:text-[#D84527] font-bold text-xs"
              >
                Auto-fill
              </button>
            </div>
            <p className="text-[#718096]">
              <span>{idLabel}: </span>
              <code className="bg-white px-1.5 py-0.5 rounded-md text-[11px] font-mono text-[#20283A] border border-[#E3E6E9] font-semibold">{active.hintId}</code>
            </p>
            <p className="text-[#718096] mt-1">
              <span>{secretLabel}: </span>
              <code className="bg-white px-1.5 py-0.5 rounded-md text-[11px] font-mono text-[#20283A] border border-[#E3E6E9] font-semibold">{active.hintSecret}</code>
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#20283A] block mb-1.5">{idLabel}</label>
              <input
                type={role === 'parent' ? 'tel' : 'text'}
                value={id}
                onChange={e => {
                  setId(e.target.value);
                  setError('');
                }}
                placeholder={role === 'parent' ? '9876543210' : role === 'student' ? 'STU-0412' : 'accounts@feeflow.demo'}
                className="w-full border border-[#E3E6E9] rounded-xl px-3.5 py-2.5 text-xs text-[#20283A] placeholder:text-[#718096] focus:outline-none focus:ring-2 focus:ring-[#20283A] transition"
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#20283A] block">{secretLabel}</label>
                {role === 'parent' && (
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={otpSending || !id.trim()}
                    className="text-[11px] font-bold text-[#E95435] hover:text-[#D84527] disabled:opacity-40 transition cursor-pointer"
                  >
                    {otpSending ? 'Generating…' : 'Get Demo OTP'}
                  </button>
                )}
              </div>
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
                  className="w-full border border-[#E3E6E9] rounded-xl px-3.5 py-2.5 pr-10 text-xs text-[#20283A] placeholder:text-[#718096] focus:outline-none focus:ring-2 focus:ring-[#20283A] transition"
                />
                {role !== 'parent' && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShow(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] hover:text-[#20283A]"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {role === 'parent' && otpInfo && (
                <p className="text-[11px] text-emerald-700 font-semibold mt-1.5 flex items-center gap-1">
                  {otpInfo}
                </p>
              )}
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-xs text-[#BA2525] font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E95435] hover:bg-[#D84527] text-white text-xs font-bold py-3 rounded-xl disabled:opacity-50 transition-all shadow-xs"
            >
              {loading ? 'Verifying…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-xs text-[#20283A]/70 font-medium text-center mt-5">
          FeeFlow Operations Platform · Multi-Portal Architecture
        </p>
      </div>
    </div>
  );
}
