"use client";

import clsx from "clsx";
import { ReactNode } from "react";

export function PanelHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon && (
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
          {icon}
        </div>
      )}
      <div>
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] tabular-nums text-slate-300">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex w-full gap-1 rounded-xl bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={clsx(
            "flex-1 rounded-lg font-medium transition-all",
            size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
            value === o.value
              ? "bg-brand-500 text-white shadow"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
    >
      <span>
        <span className="block text-xs font-medium text-slate-200">{label}</span>
        {hint && <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{hint}</span>}
      </span>
      <span
        className={clsx(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-500" : "bg-white/10"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "left-[18px]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tabular-nums text-slate-500">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 rounded-lg" />
      </div>
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className="input cursor-pointer">
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-ink-800">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function EmptyHint({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-5 py-8 text-center">
      {icon && <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-slate-500">{icon}</div>}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-[240px] text-xs leading-relaxed text-slate-500">{children}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx("animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
