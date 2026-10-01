import { useEffect, useRef, useState } from "react";
import { mergePrefill } from "../utils/farmContext";

export default function useEditablePrefill(setForm, suggestions) {
  const dirty = useRef({});
  const previous = useRef({});
  const [sources, setSources] = useState({});
  const signature = JSON.stringify(suggestions);
  useEffect(() => {
    const values = {}, labels = {};
    for (const [key, entry] of Object.entries(JSON.parse(signature))) {
      if (!dirty.current[key] && entry.value !== "" && entry.value !== null && entry.value !== undefined) {
        values[key] = entry.value; labels[key] = entry.source;
      }
    }
    const obsolete = Object.keys(previous.current).filter((key) => !dirty.current[key] && !(key in values));
    setForm((current) => {
      const cleared = { ...current };
      obsolete.forEach((key) => { cleared[key] = ""; });
      return mergePrefill(obsolete.length ? cleared : current, values, dirty.current);
    });
    previous.current = values;
    setSources((current) => {
      const next = { ...current, ...labels };
      obsolete.forEach((key) => delete next[key]);
      return next;
    });
  }, [setForm, signature]);
  const markManual = (name) => {
    dirty.current[name] = true;
    setSources((current) => ({ ...current, [name]: "Manual input" }));
  };
  return { sources, markManual, dirty };
}
