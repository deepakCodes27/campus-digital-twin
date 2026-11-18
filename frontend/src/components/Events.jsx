import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      try {
        const { data, error } = await supabase
          .from("events")
          .select(
            "id, title, description, venue, starts_at, ends_at"
          )
          .eq("is_published", true)
          .gt("ends_at", new Date().toISOString())
          .order("starts_at")
          .limit(20);

        if (error) throw error;

        if (active) {
          setEvents(data ?? []);
          setNow(Date.now());
          setErrorMessage("");
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadEvents();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  function refreshEvents() {
    if (loading) return;

    setLoading(true);
    setErrorMessage("");
    setRefreshKey((previous) => previous + 1);
  }

  const visibleEvents = events.filter(
    (event) => new Date(event.ends_at).getTime() > now
  );

  return (
    <section>
      <h2>Ongoing & Upcoming Events</h2>
      <p>All times are shown in India Standard Time (IST).</p>

      <button
        type="button"
        onClick={refreshEvents}
        disabled={loading}
      >
        {loading ? "Loading events..." : "Refresh events"}
      </button>

      {errorMessage && (
        <p role="alert">
          Could not load events: {errorMessage}
        </p>
      )}

      {loading && <p role="status">Fetching published events...</p>}

      {!loading && !errorMessage && visibleEvents.length === 0 && (
        <p>
          No ongoing or upcoming published events. An administrator
          must publish an event with an ending time in the future.
        </p>
      )}

      <div className="events-grid" aria-busy={loading}>
        {visibleEvents.map((event) => {
          const ongoing =
            new Date(event.starts_at).getTime() <= now;

          return (
            <article className="event-item" key={event.id}>
              <h3>{event.title}</h3>

              <p>
                <strong>
                  {ongoing ? "Happening now" : "Upcoming"}
                </strong>
              </p>

              <p style={{ whiteSpace: "pre-wrap" }}>
                {event.description}
              </p>

              <p>
                <strong>Venue:</strong> {event.venue}
              </p>

              <p>
                <strong>Starts:</strong>{" "}
                <time dateTime={event.starts_at}>
                  {dateFormatter.format(new Date(event.starts_at))}
                </time>
              </p>

              <p>
                <strong>Ends:</strong>{" "}
                <time dateTime={event.ends_at}>
                  {dateFormatter.format(new Date(event.ends_at))}
                </time>
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}