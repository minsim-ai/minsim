import { useState } from "react";
import { Plus, X } from "lucide-react";
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

  const primaryFields = form.fields.filter((field) => field.required || field.value !== undefined).slice(0, 3);
  const primaryIds = new Set(primaryFields.map((field) => field.id));
  const advancedFields = form.fields.filter((field) => !primaryIds.has(field.id));

  return (
    <form
      className="ks-intake-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(cleanValues(values));
      }}
    >
      <div className="ks-intake-form-intro">
        <strong>필수 정보부터 확인합니다.</strong>
        <span>이미 말한 내용은 자동으로 채워두었습니다. 모르는 선택 항목은 비워도 됩니다.</span>
      </div>
      {primaryFields.map((field) => (
        <FormField field={field} key={field.id} value={values[field.id]} onChange={(value) => update(field.id, value)} />
      ))}
      {advancedFields.length > 0 && (
        <details className="ks-intake-advanced">
          <summary>더 정확히 설정하기</summary>
          <div className="ks-intake-advanced-body">
            {advancedFields.map((field) => (
              <FormField field={field} key={field.id} value={values[field.id]} onChange={(value) => update(field.id, value)} />
            ))}
          </div>
        </details>
      )}
      <div className="ks-chat-actions">
        <button className="ks-chat-btn ks-chat-btn--primary" type="submit">
          {form.primaryAction}
        </button>
      </div>
    </form>
  );
}

function FormField({
  field,
  value,
  onChange,
}: {
  field: DynamicFormSchema["fields"][number];
  value: string | string[] | number | undefined;
  onChange: (value: string | string[] | number) => void;
}) {
  return (
    <div className="ks-intake-field">
      <span className="ks-intake-label">
        {field.label}
        {!field.required && <em>선택</em>}
        {field.source && <small>{sourceLabel(field.source)}</small>}
      </span>
      {field.type === "textarea" ? (
        <textarea
          className="ks-chat-textarea"
          rows={3}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "single_select" ? (
        <select
          className="ks-intake-select"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">선택 안 함</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : field.type === "multi_text" ? (
        <MultiTextInput
          values={toStringList(value)}
          placeholder={field.placeholder}
          maxItems={field.maxItems}
          recommendedItems={field.recommendedItems ?? (field.required ? 3 : 2)}
          onChange={onChange}
        />
      ) : (
        <input
          className="ks-chat-input"
          type={field.type === "number" ? "number" : "text"}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
        />
      )}
      {field.helperText && <span className="ks-intake-helper">{field.helperText}</span>}
    </div>
  );
}

function sourceLabel(source: NonNullable<DynamicFormSchema["fields"][number]["source"]>): string {
  if (source === "user") return "사용자 입력";
  if (source === "inferred") return "AI 추론";
  if (source === "generated") return "AI 보완";
  return "기본값";
}

function MultiTextInput({
  values,
  placeholder,
  maxItems = 8,
  recommendedItems,
  onChange,
}: {
  values: string[];
  placeholder?: string;
  maxItems?: number;
  recommendedItems: number;
  onChange: (values: string[]) => void;
}) {
  const visible = Array.from(
    { length: Math.min(maxItems, Math.max(recommendedItems, values.length)) },
    (_, index) => values[index] ?? "",
  );
  const canAdd = visible.length < maxItems;
  return (
    <div className="ks-intake-multi">
      {visible.map((value, index) => (
        <div className="ks-intake-multi-row" key={index}>
          <input
            className="ks-chat-input"
            placeholder={index === 0 ? placeholder : `${index + 1}번째 항목`}
            value={value}
            onChange={(event) => {
              const next = [...visible];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          {visible.length > 1 && (
            <button
              className="ks-intake-icon-btn"
              type="button"
              aria-label={`${index + 1}번째 항목 삭제`}
              onClick={() => onChange(visible.filter((_, itemIndex) => itemIndex !== index))}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
      ))}
      <button
        className="ks-intake-add-btn"
        type="button"
        disabled={!canAdd}
        onClick={() => onChange([...visible, ""])}
      >
        <Plus size={16} strokeWidth={2.2} />
        항목 추가
      </button>
      {!canAdd && <span className="ks-intake-helper">최대 {maxItems}개까지 입력할 수 있습니다.</span>}
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
