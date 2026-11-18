import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";

const eventColumns =
  "id, title, description, venue, starts_at, ends_at, is_published";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function emptyForm() {
  return {
    title: "",
    description: "",
    venue: "",
    startsAt: "",
    endsAt: "",
    visibility: "draft",
  };
}

// Convert a stored timestamp to an IST datetime-local input value.
function toISTInput(value) {
  if (!value) return "";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const istOffsetMilliseconds = 330 * 60 * 1000;

  return new Date(date.getTime() + istOffsetMilliseconds)
    .toISOString()
    .slice(0, 16);
}

function displayDate(value) {
  if (!value) return "Not specified";

  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? dateFormatter.format(date)
    : "Invalid date";
}

export default function AdminEvents({ userId }) {
  const [events, setEvents] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [listError, setListError] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const formRef = useRef(null);
  const requestInProgress = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        if (!userId) throw new Error("Please sign in.");

        const { data: membership, error: membershipError } =
          await supabase
            .from("admin_users")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (membershipError) throw membershipError;
        if (!active || !membership) return;

        setIsAdmin(true);

        const { data, error } = await supabase
          .from("events")
          .select(eventColumns)
          .order("starts_at", { ascending: false })
          .limit(100);

        if (!active) return;

        if (error) {
          setListError(error.message);
          return;
        }

        setEvents(data ?? []);
      } catch (error) {
        if (active) setAccessError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [userId]);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEditing(event) {
    if (requestInProgress.current) return;

    setEditingId(event.id);
    setForm({
      title: event.title ?? "",
      description: event.description ?? "",
      venue: event.venue ?? "",
      startsAt: toISTInput(event.starts_at),
      endsAt: toISTInput(event.ends_at),
      visibility: event.is_published ? "published" : "draft",
    });
    setMessage("");

    formRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function cancelEditing() {
    if (requestInProgress.current) return;

    resetForm();
    setMessage("");
  }

  async function saveEvent(event) {
    event.preventDefault();

    if (!isAdmin || requestInProgress.current) return;

    const title = form.title.trim();
    const description = form.description.trim();
    const venue = form.venue.trim();

    if (!title || title.length > 150 || !venue) {
      setMessage("Enter an event title and venue.");
      return;
    }

    if (!form.startsAt || !form.endsAt) {
      setMessage("Enter the starting and ending dates and times.");
      return;
    }

    // Explicit IST offset prevents browser timezone differences.
    const startDate = new Date(`${form.startsAt}:00+05:30`);
    const endDate = new Date(`${form.endsAt}:00+05:30`);

    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime())
    ) {
      setMessage("Enter valid dates and times.");
      return;
    }

    if (endDate <= startDate) {
      setMessage("The ending time must be after the starting time.");
      return;
    }

    const idToEdit = editingId;

    requestInProgress.current = true;
    setBusy(true);
    setMessage("");

    try {
      const values = {
        title,
        description,
        venue,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        is_published: form.visibility === "published",
      };

      const query =
        idToEdit !== null
          ? supabase.from("events").update(values).eq("id", idToEdit)
          : supabase.from("events").insert(values);

      const { data, error } = await query
        .select(eventColumns)
        .single();

      if (error) throw error;

      setEvents((previous) =>
        idToEdit !== null
          ? previous.map((item) => (item.id === data.id ? data : item))
          : [data, ...previous]
      );

      resetForm();

      setMessage(
        data.is_published
          ? "Event saved as published. It appears in Upcoming Events if its start time is still in the future."
          : "Event saved as a draft. Students cannot see it."
      );
    } catch (error) {
      setMessage(`Could not save event: ${error.message}`);
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function changeVisibility(event) {
    if (
      !isAdmin ||
      requestInProgress.current ||
      editingId !== null
    ) {
      return;
    }

    requestInProgress.current = true;
    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("events")
        .update({ is_published: !event.is_published })
        .eq("id", event.id)
        .select(eventColumns)
        .single();

      if (error) throw error;

      setEvents((previous) =>
        previous.map((item) => (item.id === data.id ? data : item))
      );

      setMessage(
        data.is_published
          ? "Event published. Upcoming Events shows only events whose start time is still in the future."
          : "Event unpublished and saved as a draft."
      );
    } catch (error) {
      setMessage(`Could not change visibility: ${error.message}`);
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  const visibleEvents = events
    .filter((event) => {
      if (filter === "published") return event.is_published;
      if (filter === "draft") return !event.is_published;
      return true;
    })
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));

  if (loading) {
    return <p>Loading event management...</p>;
  }

  if (!isAdmin) {
    return (
      <p role="alert">
        {accessError || "This section is available to admins only."}
      </p>
    );
  }

  return (
    <section>
      <h2>Manage Events</h2>
      <p>
        Create and edit college events. Enter all dates and times
        in India Standard Time (IST).
      </p>

      <form ref={formRef} onSubmit={saveEvent}>
        <h3>{editingId !== null ? "Edit event" : "Create event"}</h3>

        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label htmlFor="event-title">Event title</label>
          <input
            id="event-title"
            name="title"
            value={form.title}
            onChange={updateField}
            maxLength={150}
            required
          />

          <label htmlFor="event-description">Description</label>
          <textarea
            id="event-description"
            name="description"
            value={form.description}
            onChange={updateField}
            maxLength={3000}
            rows={5}
          />

          <label htmlFor="event-venue">Venue</label>
          <input
            id="event-venue"
            name="venue"
            value={form.venue}
            onChange={updateField}
            placeholder="Enter the actual building or venue"
            maxLength={200}
            required
          />

          <label htmlFor="event-start">Starts at (IST)</label>
          <input
            id="event-start"
            type="datetime-local"
            name="startsAt"
            value={form.startsAt}
            onChange={updateField}
            step="60"
            required
          />

          <label htmlFor="event-end">Ends at (IST)</label>
          <input
            id="event-end"
            type="datetime-local"
            name="endsAt"
            value={form.endsAt}
            onChange={updateField}
            step="60"
            required
          />

          <label htmlFor="event-visibility">Visibility</label>
          <select
            id="event-visibility"
            name="visibility"
            value={form.visibility}
            onChange={updateField}
          >
            <option value="draft">Save as draft</option>
            <option value="published">Publish to students</option>
          </select>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "12px",
            }}
          >
            <button type="submit">
              {busy
                ? "Saving..."
                : editingId !== null
                  ? "Save changes"
                  : form.visibility === "published"
                    ? "Publish event"
                    : "Save draft"}
            </button>

            {editingId !== null && (
              <button type="button" onClick={cancelEditing}>
                Cancel editing
              </button>
            )}
          </div>
        </fieldset>
      </form>

      {message && <p role="status">{message}</p>}

      <h3 style={{ marginTop: "28px" }}>Existing events</h3>
      <p>
        Loads up to 100 events ordered by starting date, latest first,
        plus events added in this session.
      </p>

      {listError && (
        <p role="alert">
          Could not load events: {listError}. Refresh after saving
          any draft you are typing.
        </p>
      )}

      <label htmlFor="event-filter">Filter by visibility</label>
      <select
        id="event-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      >
        <option value="all">All events</option>
        <option value="published">Published</option>
        <option value="draft">Drafts</option>
      </select>

      <p role="status">
        Showing {visibleEvents.length} of {events.length} loaded events.
      </p>

      {editingId !== null && (
        <p>
          Save or cancel your current edit before changing another event.
        </p>
      )}

      {visibleEvents.length === 0 ? (
        !listError && <p>No loaded events match this filter.</p>
      ) : (
        <div className="events-grid">
          {visibleEvents.map((event) => (
            <article className="event-item" key={event.id}>
              <h4>{event.title}</h4>

              <p style={{ whiteSpace: "pre-wrap" }}>
                {event.description}
              </p>

              <p>
                <strong>Venue:</strong> {event.venue}
              </p>
              <p>
                <strong>Starts:</strong> {displayDate(event.starts_at)} IST
              </p>
              <p>
                <strong>Ends:</strong> {displayDate(event.ends_at)} IST
              </p>
              <p>
                <strong>Visibility:</strong>{" "}
                {event.is_published ? "Published" : "Draft"}
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  disabled={busy || editingId !== null}
                  onClick={() => startEditing(event)}
                >
                  {editingId === event.id ? "Currently editing" : "Edit event"}
                </button>

                <button
                  type="button"
                  disabled={busy || editingId !== null}
                  onClick={() => changeVisibility(event)}
                >
                  {event.is_published ? "Unpublish" : "Publish"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}