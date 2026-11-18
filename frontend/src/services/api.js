import { supabase } from "./supabaseClient";

export async function fetchRooms() {
  const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, "");

  if (!apiUrl) {
    throw new Error("VITE_API_URL is missing. Update .env.local and restart.");
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;

  if (!session) {
    throw new Error("Please log in to view rooms.");
  }

  const response = await fetch(`${apiUrl}/rooms`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Could not load rooms.");
  }

  return result.rooms;
}