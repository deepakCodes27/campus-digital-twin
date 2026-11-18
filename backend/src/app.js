import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase settings in backend/.env");
}

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
}));

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Campus Digital Twin backend is running!",
  });
});

app.get("/api/rooms", async (req, res) => {
  res.set("Cache-Control", "no-store");

  const authorization = req.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return res.status(401).json({
      error: "Login required.",
    });
  }

  const token = match[1];

  try {
    // A separate client for each request keeps user tokens isolated.
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        error: "Session invalid or expired. Please log in again.",
      });
    }

    const { data, error } = await supabase
      .from("rooms")
      .select(`
        id,
        building_id,
        room_number,
        floor,
        capacity,
        status,
        building:buildings(name)
      `)
      .order("room_number");

    if (error) {
      console.error("Rooms query failed:", error.message);

      return res.status(500).json({
        error: "Could not load rooms.",
      });
    }

    return res.json({ rooms: data ?? [] });
  } catch {
    return res.status(500).json({
      error: "Unable to contact Supabase.",
    });
  }
});

export default app;