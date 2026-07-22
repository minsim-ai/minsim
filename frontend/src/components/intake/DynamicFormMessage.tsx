import { draftPolicyFields } from "../../api/intake";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { DynamicFormSchema } from "../../intake/types";

const POLICY_DRAFT_FIELDS = ["current_state", "proposed_change", "tradeoffs"];

export function DynamicFormMessage({
  form,
  onSubmit,
  simulationType,
}: {
  form: DynamicFormSchema;
  onSubmit: (values: Record<string, string | string[] | number>) => void;
  simulationType?: string;
}) {
  const [values, setValues] = useState<Record<string, string | string[] | number>>(() =>
    Object.fromEntries(form.fields.map((field) => [field.id, field.value ?? (field.type === "multi_text" ? [""] : "")])),
  );
  // 어느 칸이 AI 초안인지 표시한다. 사실 확인 없이 실행되는 걸 막기 위한 것이다.
  const [aiDrafted, setAiDrafted] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const update = (fieldId: string, value: string | string[] | number) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setAiDrafted((prev) => {
      if (!prev.has(fieldId)) return prev;
      const next = new Set(prev);
      next.delete(fieldId);
      return next;
    });
  };

  const showPolicyDraft =
    simulationType === "campus_policy" &&
    form.fields.some((field) => POLICY_DRAFT_FIELDS.includes(field.id));

  const runPolicyDraft = async (overwriteAll: boolean) => {
    const agenda = String(values.agenda ?? "").trim();
    if (!agenda) {
      setDraftError("먼저 안건을 적어주세요.");
      return;
    }
    setDrafting(true);
    setDraftError(null);
    try {
      const existing: Record<string, string> = {};
      if (!overwriteAll) {
        for (const id of POLICY_DRAFT_FIELDS) {
          const current = String(values[id] ?? "").trim();
          if (current && !aiDrafted.has(id)) existing[id] = current;
        }
      }
      const result = await draftPolicyFields(agenda, existing);
      setValues((prev) => ({ ...prev, ...result.fields }));
      setAiDrafted(new Set(result.ai_generated));
    } catch {
      setDraftError("초안 생성에 실패했습니다. 직접 입력하거나 다시 시도해주세요.");
    } finally {
      setDrafting(false);
    }
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
      {showPolicyDraft && (
        <div className="ks-intake-ai-toolbar">
          <button className="btn btn-ai" type="button" disabled={drafting} onClick={() => void runPolicyDraft(false)}>
            {drafting ? "생성 중…" : "✦ 빈 칸을 AI로 채우기"}
          </button>
          <button className="btn btn-ai" type="button" disabled={drafting} onClick={() => void runPolicyDraft(true)}>
            ✦ 전체를 AI로 다듬기
          </button>
          <span className="ks-intake-ai-note">
            안건만 적으면 나머지는 AI가 채웁니다. AI 초안은 사실 확인이 필요합니다.
          </span>
          {draftError && <span role="alert">{draftError}</span>}
        </div>
      )}
      {primaryFields.map((field) => (
        <FormField
          field={field}
          key={field.id}
          value={values[field.id]}
          aiDrafted={aiDrafted.has(field.id)}
          onChange={(value) => update(field.id, value)}
        />
      ))}
      {advancedFields.length > 0 && (
        <details className="ks-intake-advanced">
          <summary>더 정확히 설정하기</summary>
          <div className="ks-intake-advanced-body">
            {advancedFields.map((field) => (
              <FormField
          field={field}
          key={field.id}
          value={values[field.id]}
          aiDrafted={aiDrafted.has(field.id)}
          onChange={(value) => update(field.id, value)}
        />
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
  aiDrafted = false,
}: {
  field: DynamicFormSchema["fields"][number];
  value: string | string[] | number | undefined;
  onChange: (value: string | string[] | number) => void;
  aiDrafted?: boolean;
}) {
  return (
    <div className="ks-intake-field">
      <span className="ks-intake-label">
        {field.label}
        {aiDrafted && <em className="ks-intake-ai-mark"> ✦ AI 초안 · 사실 확인 필요</em>}
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
