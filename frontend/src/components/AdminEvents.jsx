import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";

const eventColumns =
  "id, title, description, venue, starts_at, ends_at, is_published, created_by";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const actionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginTop: "12px",
};

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

// A datetime-local input has no timezone. Show campus time even if
// the admin opens the form from a computer outside India.
function toISTInput(value) {
  if (!value) return "";

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";

  return new Date(time + 330 * 60 * 1000).toISOString().slice(0, 16);
}

function displayDate(value) {
  if (!value) return "Not specified";

  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${dateFormatter.format(date)} IST`
    : "Invalid date";
}

export default function AdminEvents({ userId }) {
  if (!userId) return <p>Please sign in.</p>;

  // Reset the form and permissions if the signed-in account changes.
  return <EventManager key={userId} userId={userId} />;
}

function EventManager({ userId }) {
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

    async function loadEvents() {
      try {
        const { data: membership, error: membershipError } = await supabase
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
        } else {
          setEvents(data ?? []);
        }
      } catch (error) {
        if (active) setAccessError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadEvents();

    return () => {
      active = false;
    };
  }, [userId]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEditing(item) {
    if (requestInProgress.current) return;

    setEditingId(item.id);
    setForm({
      title: item.title ?? "",
      description: item.description ?? "",
      venue: item.venue ?? "",
      startsAt: toISTInput(item.starts_at),
      endsAt: toISTInput(item.ends_at),
      visibility: item.is_published ? "published" : "draft",
    });

    setMessage("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function replaceEvent(updated) {
    setEvents((previous) =>
      previous.map((item) => (item.id === updated.id ? updated : item))
    );
  }

  async function runAction(action) {
    if (!isAdmin || requestInProgress.current) return;

    requestInProgress.current = true;
    setBusy(true);
    setMessage("");

    try {
      await action();
    } catch (error) {
      setMessage(`Action failed: ${error.message}`);
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function saveEvent(event) {
    event.preventDefault();

    const title = form.title.trim();
    const venue = form.venue.trim();
    const description = form.description.trim();

    if (!title || !venue) {
      setMessage("Enter an event title and venue.");
      return;
    }

    if (!form.startsAt || !form.endsAt) {
      setMessage("Enter both the start and end times.");
      return;
    }

    const start = new Date(`${form.startsAt}+05:30`);
    const end = new Date(`${form.endsAt}+05:30`);

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setMessage("Enter valid start and end times.");
      return;
    }

    if (end <= start) {
      setMessage("The event must end after it starts.");
      return;
    }

    await runAction(async () => {
      const values = {
        title,
        description,
        venue,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        is_published: form.visibility === "published",
      };

      const table = supabase.from("events");
      const query = editingId === null
        ? table.insert(values)
        : table.update(values).eq("id", editingId);

      const { data, error } = await query.select(eventColumns).single();
      if (error) throw error;

      if (editingId === null) {
        setEvents((previous) => [data, ...previous]);
      } else {
        replaceEvent(data);
      }

      resetForm();
      setMessage(
        data.is_published
          ? "Event published. Future events appear in Upcoming Events."
          : "Draft saved. Students cannot see it."
      );
    });
  }

  async function changeVisibility(item) {
    if (editingId !== null) return;

    await runAction(async () => {
      const { data, error } = await supabase
        .from("events")
        .update({ is_published: !item.is_published })
        .eq("id", item.id)
        .select(eventColumns)
        .single();

      if (error) throw error;

      replaceEvent(data);
      setMessage(
        data.is_published
          ? "Event published. Future events appear in Upcoming Events."
          : "Event unpublished and saved as a draft."
      );
    });
  }

  async function deleteEvent(item) {
    if (
      !isAdmin ||
      item.created_by !== userId ||
      editingId !== null ||
      requestInProgress.current
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete "${item.title}"?\n\n` +
      `${displayDate(item.starts_at)} · ${item.venue}\n\n` +
      "This cannot be undone."
    );

    if (!confirmed) return;

    await runAction(async () => {
      const { data, error } = await supabase
        .from("events")
        .delete()
        .eq("id", item.id)
        .eq("created_by", userId)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setMessage("Nothing was deleted. Refresh to check this event.");
        return;
      }

      // Remove the card only after the database confirms the deletion.
      setEvents((previous) => previous.filter((event) => event.id !== data.id));
      setMessage(`Deleted "${item.title}".`);
    });
  }

  if (loading) return <p>Loading event management...</p>;

  if (!isAdmin) {
    return (
      <p role="alert">
        {accessError || "This section is available to admins only."}
      </p>
    );
  }

  const visibleEvents = events
    .filter((item) => {
      if (filter === "published") return item.is_published;
      if (filter === "draft") return !item.is_published;
      return true;
    })
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

  const actionsDisabled = busy || editingId !== null;

  return (
    <section>
      <h2>Manage Events</h2>
      <p>Enter dates and times in India Standard Time (IST).</p>

      <form ref={formRef} onSubmit={saveEvent}>
        <h3>{editingId === null ? "Create event" : "Edit event"}</h3>

        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
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

          <div style={actionsStyle}>
            <button type="submit">
              {editingId !== null
                ? "Save changes"
                : form.visibility === "published"
                  ? "Publish event"
                  : "Save draft"}
            </button>

            {editingId !== null && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setMessage("");
                }}
              >
                Cancel editing
              </button>
            )}
          </div>
        </fieldset>
      </form>

      {message && <p role="status">{message}</p>}

      <h3 style={{ marginTop: "28px" }}>Existing events</h3>
      <p>Loads up to 100 events, latest start date first, plus events added here.</p>

      {listError && <p role="alert">Could not load events: {listError}</p>}

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
        <p>Save or cancel your edit before changing another event.</p>
      )}

      {!listError && visibleEvents.length === 0 && (
        <p>No events match this filter.</p>
      )}

      <div className="events-grid">
        {visibleEvents.map((item) => (
          <article className="event-item" key={item.id}>
            <h4>{item.title}</h4>
            <p style={{ whiteSpace: "pre-wrap" }}>{item.description}</p>
            <p><strong>Venue:</strong> {item.venue}</p>
            <p><strong>Starts:</strong> {displayDate(item.starts_at)}</p>
            <p><strong>Ends:</strong> {displayDate(item.ends_at)}</p>
            <p>
              <strong>Visibility:</strong> {item.is_published ? "Published" : "Draft"}
            </p>

            <div style={actionsStyle}>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => startEditing(item)}
              >
                {editingId === item.id ? "Currently editing" : "Edit event"}
              </button>

              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => changeVisibility(item)}
              >
                {item.is_published ? "Unpublish" : "Publish"}
              </button>

              {item.created_by === userId && (
                <button
                  type="button"
                  disabled={actionsDisabled}
                  aria-label={`Delete event: ${item.title}`}
                  onClick={() => deleteEvent(item)}
                >
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}