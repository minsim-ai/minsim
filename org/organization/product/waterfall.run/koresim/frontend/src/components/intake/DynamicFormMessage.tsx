import { useState } from "react";
import type { DynamicFormSchema } from "../../intake/types";

export function DynamicFormMessage({
  form,
  onSubmit,
}: {
  form: DynamicFormSchema;
  onSubmit: (values: Record<string, string | string[] | number>) => void;
}) {
  const [values, setValues] = useState<Record<string, string | string[] | number>>(() =>
    Object.fromEntries(form.fields.map((field) => [field.id, field.value ?? (field.type === "multi_text" ? [""] : "")])),
  );

  const update = (fieldId: string, value: string | string[] | number) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  return (
    <form
      className="ks-intake-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(cleanValues(values));
      }}
    >
      {form.fields.map((field) => (
        <label className="ks-intake-field" key={field.id}>
          <span className="ks-intake-label">
            {field.label}
            {!field.required && <em>선택</em>}
          </span>
          {field.type === "textarea" ? (
            <textarea
              className="ks-chat-textarea"
              rows={3}
              placeholder={field.placeholder}
              value={String(values[field.id] ?? "")}
              onChange={(event) => update(field.id, event.target.value)}
            />
          ) : field.type === "single_select" ? (
            <select
              className="ks-intake-select"
              value={String(values[field.id] ?? "")}
              onChange={(event) => update(field.id, event.target.value)}
            >
              <option value="">선택 안 함</option>
              {field.options?.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : field.type === "multi_text" ? (
            <MultiTextInput
              values={toStringList(values[field.id])}
              placeholder={field.placeholder}
              recommendedItems={field.recommendedItems ?? 3}
              onChange={(nextValues) => update(field.id, nextValues)}
            />
          ) : (
            <input
              className="ks-chat-input"
              type={field.type === "number" ? "number" : "text"}
              placeholder={field.placeholder}
              value={String(values[field.id] ?? "")}
              onChange={(event) => update(field.id, field.type === "number" ? Number(event.target.value) : event.target.value)}
            />
          )}
          {field.helperText && <span className="ks-intake-helper">{field.helperText}</span>}
        </label>
      ))}
      <div className="ks-chat-actions">
        <button className="ks-chat-btn ks-chat-btn--primary" type="submit">
          {form.primaryAction}
        </button>
      </div>
    </form>
  );
}

function MultiTextInput({
  values,
  placeholder,
  recommendedItems,
  onChange,
}: {
  values: string[];
  placeholder?: string;
  recommendedItems: number;
  onChange: (values: string[]) => void;
}) {
  const visible = Array.from({ length: Math.max(recommendedItems, values.length) }, (_, index) => values[index] ?? "");
  return (
    <div className="ks-intake-multi">
      {visible.map((value, index) => (
        <input
          className="ks-chat-input"
          key={index}
          placeholder={index === 0 ? placeholder : `${index + 1}번째 항목`}
          value={value}
          onChange={(event) => {
            const next = [...visible];
            next[index] = event.target.value;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function cleanValues(values: Record<string, string | string[] | number>): Record<string, string | string[] | number> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : value,
    ]),
  );
}

function toStringList(value: string | string[] | number | undefined): string[] {
  return Array.isArray(value) ? value.map(String) : [String(value ?? "")];
}
