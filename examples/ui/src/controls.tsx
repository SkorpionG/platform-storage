import type { ReactNode } from "react";
import { useId, useState } from "react";

import { cn } from "./cn";

export type ButtonTone = "primary" | "neutral" | "danger";

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: "border-sky-600 bg-sky-600 text-white hover:bg-sky-500 hover:border-sky-500",
  neutral: "border-line-strong bg-raised text-fg hover:bg-raised-hover",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300",
};

export interface ButtonProps {
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly tone?: ButtonTone;
  readonly disabled?: boolean | undefined;
  readonly title?: string | undefined;
}

export function Button({ onClick, children, tone = "neutral", disabled, title }: ButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
        "disabled:cursor-not-allowed disabled:opacity-40",
        BUTTON_TONES[tone],
      )}
    >
      {children}
    </button>
  );
}

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 cursor-pointer rounded-full border transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
        checked ? "border-sky-500 bg-sky-600" : "border-line-strong bg-raised",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all",
          checked ? "left-5.5" : "left-0.5",
        )}
      />
    </button>
  );
}

export interface SegmentedControlProps<Value extends string> {
  readonly value: Value;
  readonly options: ReadonlyArray<Value>;
  readonly onChange: (next: Value) => void;
  readonly label: string;
}

export function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedControlProps<Value>) {
  // Real radios rather than buttons with a role: they group themselves through the shared name, and arrow-key navigation comes from the browser instead of being reimplemented.
  const name = useId();

  return (
    <fieldset className="inline-flex rounded-md border border-line-strong bg-raised p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            "cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-500",
            option === value ? "bg-sky-600 text-white" : "text-muted hover:text-fg",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={option === value}
            onChange={() => onChange(option)}
            className="sr-only"
          />
          {option}
        </label>
      ))}
    </fieldset>
  );
}

export interface TextFieldProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly label: string;
  readonly placeholder?: string | undefined;
  readonly width?: string | undefined;
}

export function TextField({ value, onChange, label, placeholder, width }: TextFieldProps) {
  const id = useId();

  return (
    <input
      type="text"
      id={id}
      name={id}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "rounded-md border border-line-strong bg-inset px-2.5 py-1.5 text-xs text-fg",
        "placeholder:text-faint focus-visible:border-sky-500 focus-visible:outline-none",
        width ?? "w-44",
      )}
    />
  );
}

export interface SliderProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (next: number) => void;
  readonly label: string;
}

export function Slider({ value, min, max, step, onChange, label }: SliderProps) {
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        id={id}
        name={id}
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-32 cursor-pointer appearance-none rounded-full bg-line-strong accent-sky-500"
      />
      <span className="w-10 text-right font-mono text-xs text-body">{value.toFixed(2)}</span>
    </div>
  );
}

export interface StepperProps {
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly label: string;
  readonly min?: number | undefined;
}

export function Stepper({ value, onChange, label, min = 0 }: StepperProps) {
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <Button onClick={() => onChange(Math.max(min, value - 1))} title="Decrease">
        −
      </Button>
      <span className="w-10 text-center font-mono text-xs text-fg">{value}</span>
      <Button onClick={() => onChange(value + 1)} title="Increase">
        +
      </Button>
    </div>
  );
}

export interface TagInputProps {
  readonly values: ReadonlyArray<string>;
  readonly onChange: (next: Array<string>) => void;
  readonly label: string;
}

/** A list of strings. An entry is added with the button or with Enter, and removed by clicking it. */
export function TagInput({ values, onChange, label }: TagInputProps) {
  const tagId = useId();
  const [draft, setDraft] = useState("");

  const add = (): void => {
    const next = draft.trim();
    if (next === "") return;

    onChange([...values, next]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {values.map((value, index) => (
        <button
          key={`${value}-${String(index)}`}
          type="button"
          title="Remove"
          onClick={() => onChange(values.filter((_, at) => at !== index))}
          className="cursor-pointer rounded border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-[11px] text-body hover:border-rose-500/50 hover:text-rose-500 dark:hover:text-rose-300"
        >
          {value} ×
        </button>
      ))}
      <input
        type="text"
        id={tagId}
        name={tagId}
        aria-label={label}
        placeholder="add…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          add();
        }}
        className="w-24 rounded-md border border-line-strong bg-inset px-2 py-1 text-xs text-fg placeholder:text-faint focus-visible:border-sky-500 focus-visible:outline-none"
      />
      <Button onClick={add} disabled={draft.trim() === ""} title="Add to the list">
        Add
      </Button>
    </div>
  );
}

export interface SelectProps<Value extends string> {
  readonly value: Value;
  readonly options: ReadonlyArray<{
    readonly value: Value;
    readonly label: string;
  }>;
  readonly onChange: (next: Value) => void;
  readonly label: string;
}

export function Select<Value extends string>({
  value,
  options,
  onChange,
  label,
}: SelectProps<Value>) {
  const id = useId();

  return (
    <select
      id={id}
      name={id}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as Value)}
      className="cursor-pointer rounded-md border border-line-strong bg-raised px-2 py-1.5 text-xs text-fg focus-visible:border-sky-500 focus-visible:outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
