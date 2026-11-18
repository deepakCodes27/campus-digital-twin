import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";

const columns = "id, title, message, is_published, created_at, created_by";

const actionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginTop: "12px",
};

export default function AdminAnnouncements({ userId }) {
  if (!userId) return <p>Please sign in.</p>;

  // Start with fresh permissions and form data if the account changes.
  return <AnnouncementManager key={userId} userId={userId} />;
}

function AnnouncementManager({ userId }) {
  const [announcements, setAnnouncements] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [listError, setListError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("draft");
  const [filter, setFilter] = useState("all");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const formRef = useRef(null);
  const requestInProgress = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadAnnouncements() {
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
          .from("announcements")
          .select(columns)
          .order("created_at", { ascending: false })
          .limit(50);

        if (!active) return;

        if (error) {
          setListError(error.message);
        } else {
          setAnnouncements(data ?? []);
        }
      } catch (error) {
        if (active) setAccessError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAnnouncements();

    return () => {
      active = false;
    };
  }, [userId]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setVisibility("draft");
  }

  function startEditing(notice) {
    if (requestInProgress.current) return;

    setEditingId(notice.id);
    setTitle(notice.title);
    setBody(notice.message);
    setVisibility(notice.is_published ? "published" : "draft");
    setMessage("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEditing() {
    if (requestInProgress.current) return;
    resetForm();
    setMessage("");
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

  function replaceNotice(updated) {
    setAnnouncements((previous) =>
      previous.map((notice) => (notice.id === updated.id ? updated : notice))
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (!cleanTitle || cleanTitle.length > 150 ||
        !cleanBody || cleanBody.length > 3000) {
      setMessage("Enter a title of 1–150 characters and a message of 1–3000 characters.");
      return;
    }

    await runAction(async () => {
      const values = {
        title: cleanTitle,
        message: cleanBody,
        is_published: visibility === "published",
      };

      const table = supabase.from("announcements");
      const query = editingId === null
        ? table.insert(values)
        : table.update(values).eq("id", editingId);

      const { data, error } = await query.select(columns).single();
      if (error) throw error;

      if (editingId === null) {
        setAnnouncements((previous) => [data, ...previous]);
      } else {
        replaceNotice(data);
      }

      resetForm();
      setMessage(
        data.is_published
          ? "Announcement published to students."
          : "Draft saved. It is hidden from students."
      );
    });
  }

  async function changeVisibility(notice) {
    if (editingId !== null) return;

    await runAction(async () => {
      const { data, error } = await supabase
        .from("announcements")
        .update({ is_published: !notice.is_published })
        .eq("id", notice.id)
        .select(columns)
        .single();

      if (error) throw error;

      replaceNotice(data);
      setMessage(
        data.is_published
          ? "Announcement published to students."
          : "Announcement unpublished and saved as a draft."
      );
    });
  }

  async function deleteAnnouncement(notice) {
    if (
      !isAdmin ||
      notice.created_by !== userId ||
      editingId !== null ||
      requestInProgress.current
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete "${notice.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    await runAction(async () => {
      const { data, error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", notice.id)
        .eq("created_by", userId)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      // Only remove the card after Supabase confirms it deleted the row.
      if (!data) {
        setMessage("Nothing was deleted. Refresh to check this announcement.");
        return;
      }

      setAnnouncements((previous) =>
        previous.filter((item) => item.id !== data.id)
      );
      setMessage(`Deleted "${notice.title}".`);
    });
  }

  if (loading) return <p>Loading announcement management...</p>;

  if (!isAdmin) {
    return (
      <p role="alert">
        {accessError || "This section is available to admins only."}
      </p>
    );
  }

  const visibleAnnouncements = announcements.filter((notice) => {
    if (filter === "published") return notice.is_published;
    if (filter === "draft") return !notice.is_published;
    return true;
  });

  return (
    <section>
      <h2>Manage Announcements</h2>
      <p>Create, edit, and publish campus notices. You can delete your own notices.</p>

      <form ref={formRef} onSubmit={handleSubmit}>
        <h3>{editingId === null ? "Create announcement" : "Edit announcement"}</h3>

        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <label htmlFor="notice-title">Title</label>
          <input
            id="notice-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={150}
            required
          />

          <label htmlFor="notice-body">Announcement</label>
          <textarea
            id="notice-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={3000}
            rows={5}
            required
          />

          <label htmlFor="notice-visibility">Visibility</label>
          <select
            id="notice-visibility"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
          >
            <option value="draft">Save as draft</option>
            <option value="published">Publish to students</option>
          </select>

          <div style={actionsStyle}>
            <button type="submit">
              {editingId !== null
                ? "Save changes"
                : visibility === "published"
                  ? "Publish announcement"
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

      <h3 style={{ marginTop: "28px" }}>Existing announcements</h3>
      <p>Showing the latest 50 notices, plus any added in this session.</p>

      {listError && (
        <p role="alert">Could not load announcements: {listError}</p>
      )}

      <label htmlFor="notice-filter">Filter by visibility</label>
      <select
        id="notice-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      >
        <option value="all">All announcements</option>
        <option value="published">Published</option>
        <option value="draft">Drafts</option>
      </select>

      <p role="status">
        Showing {visibleAnnouncements.length} of {announcements.length} loaded announcements.
      </p>

      {editingId !== null && (
        <p>Save or cancel your edit before changing another announcement.</p>
      )}

      {!listError && visibleAnnouncements.length === 0 && (
        <p>
          {announcements.length === 0
            ? "No announcements have been created yet."
            : "No announcements match this filter."}
        </p>
      )}

      {visibleAnnouncements.map((notice) => (
        <article key={notice.id} className="report-item">
          <h4>{notice.title}</h4>
          <p style={{ whiteSpace: "pre-wrap" }}>{notice.message}</p>
          <p>
            Visibility: <strong>{notice.is_published ? "Published" : "Draft"}</strong>
          </p>
          <p>Created: {new Date(notice.created_at).toLocaleString()}</p>

          <div style={actionsStyle}>
            <button
              type="button"
              disabled={busy || editingId !== null}
              onClick={() => startEditing(notice)}
            >
              {editingId === notice.id ? "Currently editing" : "Edit announcement"}
            </button>

            <button
              type="button"
              disabled={busy || editingId !== null}
              onClick={() => changeVisibility(notice)}
            >
              {notice.is_published ? "Unpublish" : "Publish"}
            </button>

            {notice.created_by === userId && (
              <button
                type="button"
                disabled={busy || editingId !== null}
                aria-label={`Delete announcement: ${notice.title}`}
                onClick={() => deleteAnnouncement(notice)}
              >
                Delete
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}