"use client";

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Textarea from "../components/ui/Textarea";
import Button from "../components/ui/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function CreateCommunityModal({ open, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || submitting) return;
    setError("");
    setSubmitting(true);

    const { data: community, error: insertErr } = await supabase
      .from("communities")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setSubmitting(false);
      return;
    }

    if (community?.id) {
      await supabase.from("community_members").insert({
        community_id: community.id,
        user_id: user.id,
        role: "admin",
      });
    }

    setSubmitting(false);
    setName("");
    setDescription("");
    onCreated();
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        role="presentation"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal
        aria-label="Kreiraj zajednicu"
      >
        <Card
          className="premium-surface w-full max-w-md"
          style={{ maxHeight: "90vh", overflow: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="m-0 text-lg font-semibold">Kreiraj zajednicu</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Zatvori"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naziv *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Naziv zajednice"
                required
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opis (opciono)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kratak opis"
                rows={3}
                maxLength={500}
              />
            </div>
            {error && <p className="m-0 text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>
                Otkaži
              </Button>
              <Button type="submit" variant="primary" disabled={submitting || !name.trim()}>
                {submitting ? "Kreiranje..." : "Kreiraj"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
