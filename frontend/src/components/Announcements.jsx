import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [connection, setConnection] = useState("Connecting...");

  useEffect(() => {
    let active = true;
    let latestRequest = 0;

    async function loadAnnouncements() {
      const requestId = ++latestRequest;

      try {
        const { data, error } = await supabase
          .from("announcements")
          .select("id, title, message, created_at")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) throw error;

        if (active && requestId === latestRequest) {
          setAnnouncements(data ?? []);
          setErrorMessage("");
        }
      } catch (error) {
        if (active && requestId === latestRequest) {
          setErrorMessage(error.message);
        }
      } finally {
        if (active && requestId === latestRequest) {
          setLoading(false);
        }
      }
    }

    const channel = supabase
      .channel("campus-announcements")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
        },
        () => {
          // Fetch again so the database applies the read policy.
          void loadAnnouncements();
        }
      )
      .subscribe((status) => {
        if (!active) return;

        if (status === "SUBSCRIBED") {
          setConnection("Live connection active");
          void loadAnnouncements();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setConnection("Live connection unavailable; periodic refresh active");
        }
      });

    void loadAnnouncements();

    // Also catches missed changes, including unpublished notices.
    const refreshTimer = window.setInterval(() => {
      void loadAnnouncements();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <section className="announcements-section">
      <h2>Campus Announcements</h2>

      <p className="announcement-connection" role="status">
        {connection}
      </p>

      <p>Also checks for updates every 30 seconds.</p>

      {errorMessage && (
        <p role="alert">
          Could not refresh announcements: {errorMessage}
        </p>
      )}

      {loading ? (
        <p>Loading announcements...</p>
      ) : announcements.length === 0 ? (
        <p>No published announcements to display.</p>
      ) : (
        announcements.map((announcement) => (
          <article className="announcement-item" key={announcement.id}>
            <h3>{announcement.title}</h3>
            <p>{announcement.message}</p>

            <small>
              Posted:{" "}
              {new Date(announcement.created_at).toLocaleString()}
            </small>
          </article>
        ))
      )}
    </section>
  );
}