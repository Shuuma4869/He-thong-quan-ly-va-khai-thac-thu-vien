import { useId } from 'react';

export function RatingInput({ value, onChange, disabled = false }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  const name = useId();
  return <fieldset disabled={disabled} className="my-4"><legend className="font-semibold">Điểm đánh giá</legend>
    <div className="mt-2 flex flex-wrap gap-3">{[1, 2, 3, 4, 5].map(score => <label key={score}
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-3 ${value === score ? 'border-primary bg-primary-soft' : 'border-line'}`}>
      <input type="radio" name={name} value={score} checked={value === score} onChange={() => onChange(score)} required aria-label={`${score} sao`}/>
      <span aria-hidden="true">{score} ★</span>
    </label>)}</div>
  </fieldset>;
}
