"use client";

import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";

export function EvidencePicker({
  file,
  onChange,
  label = "Upload screenshot",
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  label?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (preview) {
    return (
      <div className="relative overflow-hidden rounded-md border border-border">
        <img src={preview} alt="evidence" className="max-h-48 w-full object-contain bg-surface-muted" />
        <button
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-border-strong p-4 text-center text-xs text-muted hover:bg-surface-muted">
      <ImagePlus className="h-5 w-5" />
      {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
