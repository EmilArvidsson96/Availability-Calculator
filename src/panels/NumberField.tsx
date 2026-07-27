export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field__label">
        {props.label}
        {props.suffix && <span className="field__suffix">{props.suffix}</span>}
      </span>
      <input
        type="number"
        value={Number.isFinite(props.value) ? props.value : 0}
        step={props.step ?? 1}
        min={props.min}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
      {props.hint && <span className="field__hint">{props.hint}</span>}
    </label>
  );
}
