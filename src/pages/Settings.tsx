import { useState } from 'react';
import { Card, Button, Input } from '../components/ui';
import { Settings as SettingsIcon, Save, Bell, Building2, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Settings() {
  const { addNotification } = useApp();
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    addNotification({ type: 'success', title: 'Settings saved', message: 'Configuration updated. (Demo — no backend)' });
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-base font-semibold text-slate-900">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Platform configuration · Demo mode</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5 text-xs text-amber-700">
        Demo mode — settings are not persisted to a backend.
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-500" /> Institute Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Institute Name" defaultValue="Apex Coaching Institute" />
            <Input label="Registration Number" defaultValue="DEMO-2024-001" />
            <Input label="Primary Contact" defaultValue="+91 98765 43210" />
            <Input label="Email" type="email" defaultValue="accounts@apex-institute.example.com" />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-500" /> Reminder Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Reminder Lead Days" type="number" defaultValue="5" />
            <Input label="Overdue Reminder Interval (days)" type="number" defaultValue="3" />
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-600 mb-2">Enabled Channels</p>
            <div className="flex gap-4">
              {['WhatsApp', 'SMS', 'Email', 'Call'].map(ch => (
                <label key={ch} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" defaultChecked={ch !== 'Call'} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  {ch}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-600 mb-2">Default Message Template (English)</p>
            <textarea
              rows={3}
              defaultValue="Dear {parentName}, a fee instalment of {amount} is due on {dueDate} for {studentName} ({course}). Please pay at the earliest. — FeeFlow, {centre}"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-500" /> Risk Flag Rules
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Input label="High Risk Attendance Threshold (%)" type="number" defaultValue="65" />
            <Input label="Medium Risk Attendance Threshold (%)" type="number" defaultValue="75" />
            <Input label="Overdue Days for High Risk Flag" type="number" defaultValue="30" />
            <Input label="Max Overdue Instalments Before High Risk" type="number" defaultValue="2" />
          </div>
          <p className="text-xs text-slate-500 mt-3">Risk flags create counsellor tasks only. They do not automatically trigger fee actions or parent messages.</p>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saved}>
            <Save className="w-3.5 h-3.5" />
            {saved ? 'Saved' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
}

