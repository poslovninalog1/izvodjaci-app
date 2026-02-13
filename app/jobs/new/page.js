"use client";

import { useState } from "react";
import { supabase } from "../../../src/lib/supabaseClient";

export default function NewJob() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setMsg("Saving...");

    const { error } = await supabase.from("jobs").insert([{
      title,
      description,
      municipality,
      budget_max: budgetMax ? Number(budgetMax) : null
    }]);

    if (error) setMsg("Error: " + error.message);
    else setMsg("Saved! Provjeri Supabase -> Table Editor -> jobs.");
  };

  return (
    <div style={{ maxWidth: 520, margin: "40px auto" }}>
      <h1>Objavi posao</h1>
      <form onSubmit={submit}>
        <input placeholder="Naziv posla" value={title} onChange={(e)=>setTitle(e.target.value)} style={{ width:"100%", margin:"8px 0" }} />
        <textarea placeholder="Opis" value={description} onChange={(e)=>setDescription(e.target.value)} style={{ width:"100%", margin:"8px 0", height:120 }} />
        <input placeholder="Opština (npr. Podgorica)" value={municipality} onChange={(e)=>setMunicipality(e.target.value)} style={{ width:"100%", margin:"8px 0" }} />
        <input placeholder="Budžet max (EUR)" value={budgetMax} onChange={(e)=>setBudgetMax(e.target.value)} style={{ width:"100%", margin:"8px 0" }} />
        <button type="submit">Sačuvaj</button>
      </form>
      <p>{msg}</p>
    </div>
  );
}
