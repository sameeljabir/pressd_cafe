"use client";

// One product's details. Works on a copy; "Apply" hands a validated patch back
// to the menu manager (nothing is saved until "Save draft" there).

import { useMemo, useState } from "react";
import ImagePicker from "./ImagePicker";
import type { MenuCategory, MenuItem } from "@/data/menu";
import { CUSTOMIZE, NUTRITION, NUTRITION_LABEL, TAGS, parseNutrition, type CustomizeChoice, type ProductPatch } from "@/lib/content/menu";

export interface ProductFormValues {
  name: string;
  description: string;
  price: string;
  category: string;
  column: string;
  tag: string;
  size: string;
  customize: CustomizeChoice;
  ingredients: string;
  image: string;
  imageAlt: string;
  hidden: boolean;
  nutrition: Record<(typeof NUTRITION)[number], string>;
}

const CUSTOMIZE_LABEL: Record<CustomizeChoice, string> = {
  auto: "Automatic (coffee & iced drinks: full, protein shakes: milk only)",
  full: "Full (beans, milk, syrup)",
  "milk-only": "Milk only",
  none: "None",
};
const TAG_LABEL: Record<string, string> = { "": "None", V: "V — vegetarian", VG: "VG — vegan" };

export function formFromItem(item: MenuItem | null, category: string, hidden: boolean): ProductFormValues {
  const d = item?.[5];
  return {
    name: item?.[0] ?? "",
    description: item?.[1] ?? "",
    price: item ? String(item[2]) : "",
    category,
    column: item?.[6] ?? "",
    tag: item?.[4] ?? "",
    size: d?.size ?? "",
    customize: d?.customize ?? "auto",
    ingredients: (d?.ingredients ?? []).join("\n"),
    image: item?.[3] ?? "",
    imageAlt: d?.imageAlt ?? "",
    hidden,
    nutrition: Object.fromEntries(NUTRITION.map((k) => [k, d ? String(parseNutrition(d[k]) ?? "") : ""])) as ProductFormValues["nutrition"],
  };
}

/** The form as a product patch (numbers parsed; empty nutrition = not shown). */
export function patchFromForm(f: ProductFormValues): ProductPatch {
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  return {
    name: f.name,
    description: f.description,
    price: num(f.price),
    category: f.category,
    column: f.column,
    tag: f.tag,
    size: f.size,
    customize: f.customize,
    ingredients: f.ingredients.split("\n").map((s) => s.trim()).filter(Boolean),
    image: f.image,
    imageAlt: f.imageAlt,
    hidden: f.hidden,
    ...Object.fromEntries(NUTRITION.map((k) => [k, f.nutrition[k].trim() === "" ? null : num(f.nutrition[k])])),
  };
}

export default function ProductEditor({
  title,
  initial,
  categories,
  canDraft,
  error,
  onApply,
  onCancel,
}: {
  title: string;
  initial: ProductFormValues;
  categories: MenuCategory[];
  canDraft: boolean;
  /** Validation message from the last Apply, if any. */
  error: { field: string; message: string } | null;
  onApply: (f: ProductFormValues) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const [newColumn, setNewColumn] = useState(false);
  const set = <K extends keyof ProductFormValues>(k: K, v: ProductFormValues[K]) => setF((x) => ({ ...x, [k]: v }));
  const columns = useMemo(() => [...new Set(categories.find((c) => c.slug === f.category)?.items.map((i) => i[6]) ?? [])], [categories, f.category]);
  const errFor = (k: string) => (error && error.field.split(".").pop() === k ? <span className="field-error" role="alert">{error.message}</span> : null);
  const priceProblem = f.price.trim() && !/^\d+(\.\d{1,2})?$/.test(f.price.trim()) ? "Enter a price like 26 or 26.50" : null;

  return (
    <section className="card" aria-labelledby="pe-title">
      <h2 className="section" id="pe-title">{title}</h2>
      <fieldset disabled={!canDraft} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 14 }}>
        <div className="form-row">
          <label className="field"><span>Name (English)</span><input className="input" value={f.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />{errFor("name")}</label>
          <label className="field"><span>Price (AED)</span><input className="input" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} aria-invalid={priceProblem ? true : undefined} />{priceProblem ? <span className="field-error">{priceProblem}</span> : errFor("price")}</label>
        </div>
        <label className="field"><span>Description (English)</span><textarea className="input" rows={2} maxLength={200} value={f.description} onChange={(e) => set("description", e.target.value)} />{errFor("description")}</label>
        <div className="form-row">
          <label className="field">
            <span>Category</span>
            <select className="input" value={f.category} onChange={(e) => { set("category", e.target.value); setNewColumn(false); }}>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.category}</option>)}
            </select>
            {errFor("category")}
          </label>
          <label className="field">
            <span>Subcategory</span>
            {newColumn || !columns.length ? (
              <input className="input" value={f.column} maxLength={30} placeholder="New subcategory name" onChange={(e) => set("column", e.target.value)} />
            ) : (
              <select className="input" value={columns.includes(f.column) ? f.column : ""} onChange={(e) => (e.target.value === "__new" ? (setNewColumn(true), set("column", "")) : set("column", e.target.value))}>
                {!columns.includes(f.column) ? <option value="">Choose…</option> : null}
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__new">New subcategory…</option>
              </select>
            )}
            {errFor("column")}
          </label>
        </div>
        <div className="form-row">
          <label className="field"><span>Dietary tag</span><select className="input" value={f.tag} onChange={(e) => set("tag", e.target.value)}>{TAGS.map((t) => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}</select></label>
          <label className="field"><span>Size (optional)</span><input className="input" value={f.size} maxLength={24} placeholder="e.g. 350 ml" onChange={(e) => set("size", e.target.value)} /></label>
          <label className="field"><span>Customisation</span><select className="input" value={f.customize} onChange={(e) => set("customize", e.target.value as CustomizeChoice)}>{CUSTOMIZE.map((c) => <option key={c} value={c}>{CUSTOMIZE_LABEL[c]}</option>)}</select></label>
        </div>
        <label className="field"><span>Ingredients (English, one per line)</span><textarea className="input" rows={5} value={f.ingredients} onChange={(e) => set("ingredients", e.target.value)} /><span className="hint">Changing the number of ingredients marks this product&apos;s ingredient translations as needing an update.</span>{errFor("ingredients")}</label>
        <div className="field">
          <span>Nutrition (per serving; leave empty if unknown)</span>
          <div className="form-row">
            {NUTRITION.map((k) => (
              <label className="field" key={k}>
                <span>{NUTRITION_LABEL[k]}</span>
                <input className="input" inputMode="decimal" value={f.nutrition[k]} onChange={(e) => set("nutrition", { ...f.nutrition, [k]: e.target.value })} />
                {errFor(k)}
              </label>
            ))}
          </div>
        </div>
        {f.image ? (
          <ImagePicker label="Photo" value={f.image} onChange={(src) => set("image", src)} disabled={!canDraft} />
        ) : (
          <div className="field"><span>Photo</span><ImagePicker label="Photo (required)" value="" onChange={(src) => set("image", src)} disabled={!canDraft} /></div>
        )}
        {errFor("image")}
        <label className="field"><span>Photo alt text (optional)</span><input className="input" value={f.imageAlt} maxLength={125} placeholder="Describes the photo for Google and screen readers" onChange={(e) => set("imageAlt", e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={f.hidden} onChange={(e) => set("hidden", e.target.checked)} /><span>Hidden from the menu <span className="hint">Kept for existing carts and history; can be shown again at any time.</span></span></label>
      </fieldset>
      {error && !["name", "price", "description", "category", "column", "ingredients", "image", ...NUTRITION].includes(error.field.split(".").pop() ?? "") ? <p className="field-error" role="alert">{error.message}</p> : null}
      <div className="chip-row" style={{ marginTop: 14 }}>
        {canDraft ? <button type="button" className="btn btn-primary" disabled={!!priceProblem} onClick={() => onApply(f)}>Apply</button> : null}
        <button type="button" className="btn" onClick={onCancel}>{canDraft ? "Cancel" : "Close"}</button>
      </div>
    </section>
  );
}
