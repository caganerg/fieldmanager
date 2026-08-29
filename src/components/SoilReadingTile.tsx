"use client";

import { levelBadgeClass, rateMeasurement, soilParameter, type SoilMeasurementKey } from "@/lib/soil";

/**
 * One reading off a soil report — the parameter, the number with its unit, and
 * the band the number falls in.
 *
 * It lives on its own because two modules draw it: the soil dialog, on the
 * summary of the latest report, and the fertilisation dialog, on the organic
 * and mineral values a dosage is chosen against. An unmeasured value shows a
 * dash rather than disappearing, so a fixed set of keys keeps its grid; a
 * caller drawing a variable set filters with `measuredKeys` first.
 */
export default function SoilReadingTile({
  measurementKey,
  value,
}: {
  measurementKey: SoilMeasurementKey;
  value: string;
}) {
  const parameter = soilParameter(measurementKey);
  const rating = rateMeasurement(parameter, value);
  return (
    <div className="rounded-lg bg-white/80 dark:bg-zinc-900/70 px-2 py-1.5 min-w-0">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{parameter.label}</div>
      <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
        {rating ? value : "—"}
        {rating && parameter.unit && (
          <span className="text-[10px] font-normal text-zinc-400 ml-1">{parameter.unit}</span>
        )}
      </div>
      {rating && (
        <span
          className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${levelBadgeClass(rating.level)}`}
        >
          {rating.label}
        </span>
      )}
    </div>
  );
}
