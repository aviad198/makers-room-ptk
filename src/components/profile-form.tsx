'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProfileForm({
  initialName,
  initialPhone,
  email,
}: {
  initialName: string;
  initialPhone: string;
  email: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone }),
      });
      const body = await response.json();
      if (!response.ok) {
        const fieldError =
          body.issues?.fieldErrors?.phone?.[0] ??
          body.issues?.fieldErrors?.fullName?.[0] ??
          body.error;
        setError(fieldError ?? 'Could not save your details.');
        return;
      }
      setSaved(true);
      router.push('/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Network error.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Full name</span>
        <input
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
          maxLength={80}
          placeholder="Dana Levi"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Phone</span>
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          inputMode="tel"
          placeholder="+972 50 123 4567"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <span className="mt-1 block text-xs text-slate-400">
          Used only to reach you about your prints, or if an urgent job bumps one.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
        <input
          value={email}
          readOnly
          disabled
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
        />
        <span className="mt-1 block text-xs text-slate-400">
          Comes from your Google account.
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <button
        type="submit"
        disabled={isSaving}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : 'Save and continue'}
      </button>
    </form>
  );
}
