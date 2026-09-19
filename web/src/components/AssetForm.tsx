import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  AssetFieldsSchema,
  AssetInputSchema,
  type Asset,
  type AssetInput,
} from "@asset-tracker/shared";
import { ApiError } from "../api/client";
import { STATUS_LABEL, TYPE_LABEL } from "../status";
import { LocationPicker } from "./LocationPicker";
import type { MapView } from "./AssetMap";

interface Props {
  asset?: Asset; // present when editing, absent when creating
  initialView: MapView;
  submitLabel: string;
  onSubmit: (input: AssetInput) => Promise<unknown>;
  onCancel: () => void;
}

// Local date as YYYY-MM-DD (toISOString would use UTC and can be off by a day).
const today = () => new Date().toLocaleDateString("en-CA");
const FIELD_NAMES = Object.keys(AssetFieldsSchema.shape);

// The form edits every field except the id.
function toFormValues(asset: Asset): AssetInput {
  const { id: _id, ...fields } = asset;
  return fields;
}

// Validation lives in the shared zod schema. The form runs it for instant feedback;
// the API runs the same schema again, because the server can't trust the client.
export function AssetForm({ asset, initialView, submitLabel, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(AssetInputSchema),
    defaultValues: asset
      ? toFormValues(asset)
      : { name: "", type: "valve", status: "ok", installed_at: today(), last_inspected_at: null, notes: "" },
  });

  const submit = handleSubmit(async (input) => {
    try {
      await onSubmit(input);
    } catch (err) {
      // Show server-side validation errors next to the matching field.
      const details = err instanceof ApiError ? err.body?.error.details : undefined;
      if (details?.length) {
        for (const d of details) {
          const field = FIELD_NAMES.includes(d.path) ? (d.path as keyof AssetInput) : "root";
          setError(field, { message: d.message });
        }
      } else {
        setError("root", { message: err instanceof Error ? err.message : "Could not save the asset" });
      }
    }
  });

  const pick = (lat: number, lng: number) => {
    setValue("lat", lat, { shouldValidate: true, shouldDirty: true });
    setValue("lng", lng, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <form className="asset-form" onSubmit={submit} noValidate>
      <Field label="Name" error={errors.name?.message}>
        <input {...register("name")} autoFocus={!asset} />
      </Field>

      <div className="field-row">
        <Field label="Type" error={errors.type?.message}>
          <select {...register("type")}>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <select {...register("status")}>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="field">
        <span className="field-label">Location</span>
        <span className="field-hint">Click the map to place the asset, or type coordinates.</span>
        <LocationPicker lat={watch("lat")} lng={watch("lng")} initialView={initialView} onPick={pick} />
      </div>
      <div className="field-row">
        <Field label="Latitude" error={errors.lat?.message}>
          <input type="number" step="any" {...register("lat", { valueAsNumber: true })} />
        </Field>
        <Field label="Longitude" error={errors.lng?.message}>
          <input type="number" step="any" {...register("lng", { valueAsNumber: true })} />
        </Field>
      </div>

      <div className="field-row">
        <Field label="Installed" error={errors.installed_at?.message}>
          <input type="date" {...register("installed_at")} />
        </Field>
        <Field label="Last inspected" error={errors.last_inspected_at?.message}>
          {/* An empty date input means "never inspected", which the API represents as null. */}
          <input type="date" {...register("last_inspected_at", { setValueAs: (v) => (v === "" ? null : v) })} />
        </Field>
      </div>

      <Field label="Notes" error={errors.notes?.message}>
        <textarea rows={3} {...register("notes")} />
      </Field>

      {errors.root && <p className="form-error">{errors.root.message}</p>}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
