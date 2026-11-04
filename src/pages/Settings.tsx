import { useState } from 'react';
import { Card, Button, Input } from '../components/ui';
import { Save, Bell, Building2, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Settings() {
  const { addNotification } = useApp();
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    addNotification({ type: 'success', title: 'Settings saved', message: 'Configuration updated successfully.' });
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-[#20283A] tracking-tight">System Settings</h1>
        <p className="text-xs text-[#718096] mt-1 font-normal">Platform configuration, notifications and policy defaults</p>
      </div>

      <div className="bg-amber-50/75 border border-amber-200 rounded-2xl px-4 py-2.5 text-xs text-amber-900">
        Demo mode — preferences are loaded from runtime configuration defaults.
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <Card className="p-5 rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <h2 className="text-sm font-bold text-[#20283A] mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#79A9D1]" /> Institute Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Institute Name" defaultValue="FeeFlow Coaching Institute" />
            <Input label="Registration Number" defaultValue="REG-2026-JAIPUR-001" />
            <Input label="Primary Contact" defaultValue="+91 141 2700100" />
            <Input label="Email" type="email" defaultValue="accounts@feeflow.example.com" />
          </div>
        </Card>

        <Card className="p-5 rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <h2 className="text-sm font-bold text-[#20283A] mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#79A9D1]" /> Reminder Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Reminder Lead Days" type="number" defaultValue="7" />
            <Input label="Overdue Reminder Interval (days)" type="number" defaultValue="7" />
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-[#20283A] mb-2">Enabled Channels</p>
            <div className="flex gap-4">
              {['WhatsApp', 'SMS', 'Email', 'Call'].map(ch => (
                <label key={ch} className="flex items-center gap-2 text-xs font-medium text-[#20283A] cursor-pointer">
                  <input type="checkbox" defaultChecked={ch !== 'Call'} className="rounded border-[#E3E6E9] text-[#20283A] focus:ring-[#20283A]" />
                  {ch}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-[#20283A] mb-2">Default Message Template (English)</p>
            <textarea
              rows={3}
              defaultValue="Dear {parentName}, a fee instalment of {amount} is due on {dueDate} for {studentName} ({course}). Please pay at the earliest. — FeeFlow, {centre}"
              className="w-full border border-[#E3E6E9] rounded-xl px-3 py-2 text-xs font-mono text-[#20283A] focus:outline-none focus:ring-2 focus:ring-[#20283A]"
            />
          </div>
        </Card>

        <Card className="p-5 rounded-2xl border border-[#E3E6E9] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <h2 className="text-sm font-bold text-[#20283A] mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#79A9D1]" /> Risk Flag Rules
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Input label="High Risk Attendance Threshold (%)" type="number" defaultValue="65" />
            <Input label="Medium Risk Attendance Threshold (%)" type="number" defaultValue="75" />
            <Input label="Overdue Days for High Risk Flag" type="number" defaultValue="30" />
            <Input label="Max Overdue Instalments Before High Risk" type="number" defaultValue="2" />
          </div>
          <p className="text-xs text-[#718096] mt-3">Risk flags create counsellor tasks only. They do not automatically trigger fee actions or parent messages.</p>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saved} className="bg-[#E95435] hover:bg-[#D84527] text-white">
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saved ? 'Saved' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
}
